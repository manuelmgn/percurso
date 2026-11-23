#!/usr/bin/env python3
"""Functional smoke test for Percursos (Phase 5.1a)."""

from datetime import date
from io import BytesIO
from PIL import Image
from fastapi.testclient import TestClient
from app.config import settings
from app.main import app
from app.database import SessionLocal
from app.models import User, Place, Project, Trip, TripPlace, TripProject, ProjectPlace, Milestone, Activity, PlaceType, Photo, UserRole
from app.auth import hash_password


def make_image():
    img = Image.new('RGB', (100, 100), color='red')
    buf = BytesIO()
    img.save(buf, format='PNG')
    buf.seek(0)
    return buf


def make_image_with_exif():
    """JPEG carrying DateTimeOriginal and GPS coords for the EXIF round-trip."""
    img = Image.new('RGB', (100, 100), color='blue')
    exif = Image.Exif()
    exif_ifd = exif.get_ifd(0x8769)
    exif_ifd[36867] = '2023:05:14 10:30:00'
    # The modified IFD must be reassigned onto the Exif object or Pillow
    # silently drops it when serialising.
    exif[0x8769] = exif_ifd
    gps_ifd = exif.get_ifd(0x8825)
    gps_ifd[1] = 'N'
    gps_ifd[2] = (42.88, 0, 0)
    gps_ifd[3] = 'W'
    gps_ifd[4] = (8.54, 0, 0)
    exif[0x8825] = gps_ifd
    buf = BytesIO()
    img.save(buf, format='JPEG', exif=exif)
    buf.seek(0)
    return buf


def login(client, username, password):
    """Logs in and stores the CSRF header. The backend uses a separate CSRF
    token (session cookie stays http-only), returned by login/auth/me."""
    r = client.post('/api/auth/login', json={'username': username, 'password': password})
    assert r.status_code == 200, f'login failed: {r.text}'
    csrf_token = r.json()['csrf_token']
    client.headers.update({'x-csrf-token': csrf_token})
    return r.json()['user']


def create_user(db, username, password):
    u = User(username=username, password_hash=hash_password(password), role='user', is_active=True)
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def reset_test_data(db):
    orphan_files = []
    for username in ['smoke_user1', 'smoke_user2', 'smoke_user3']:
        u = db.query(User).filter(User.username == username).first()
        if u:
            db.query(Activity).filter(Activity.user_id == u.id).delete()
            db.query(Milestone).filter(Milestone.user_id == u.id).delete()
            # Collect the photo files before the rows go away (FK cascades
            # delete the rows, never the files) and unlink them after commit.
            photo_urls = [url for (url,) in db.query(Photo.url).filter(Photo.uploader_id == u.id).all()]
            trip_ids = [t.id for t in u.trips]
            if trip_ids:
                photo_urls += [url for (url,) in db.query(Photo.url).filter(Photo.trip_id.in_(trip_ids)).all()]
            orphan_files += photo_urls
            db.query(Photo).filter(Photo.uploader_id == u.id).delete()
            db.query(TripProject).filter(TripProject.trip_id.in_(trip_ids)).delete()
            db.query(TripPlace).filter(TripPlace.trip_id.in_(trip_ids)).delete()
            db.query(Trip).filter(Trip.creator_id == u.id).delete()
            db.query(ProjectPlace).filter(ProjectPlace.project_id.in_([p.id for p in u.projects])).delete()
            db.query(Project).filter(Project.creator_id == u.id).delete()
            db.delete(u)
    for name in ['Santiago de Compostela', 'Lugo', 'Lugo Sur', 'A Coruña', 'Polo Norte Teste']:
        db.query(Place).filter(Place.name == name).delete()
    db.commit()
    for url in orphan_files:
        try:
            (settings.uploads_dir / url.rsplit('/', 1)[-1]).unlink(missing_ok=True)
        except OSError:
            pass


def main():
    # New tables added since the DB file was created only appear via create_all
    # (run here before the first TestClient request triggers the app lifespan).
    from app.database import engine, Base
    from app import models as _models  # noqa: F401 — register all models with the metadata
    Base.metadata.create_all(bind=engine)
    # Column additions for pre-existing DB files; also runs before the first
    # TestClient request would trigger the same thing via the app lifespan.
    from app.main import _apply_lightweight_migrations
    _apply_lightweight_migrations()

    db = SessionLocal()
    try:
        reset_test_data(db)

        user1 = create_user(db, 'smoke_user1', 'pass12345')
        user2 = create_user(db, 'smoke_user2', 'pass12345')

        # Pre-create places to avoid Nominatim calls
        santiago = Place(name='Santiago de Compostela', osm_type='node', osm_id=1001, place_type=PlaceType.TOWN, lat=42.88, lon=-8.54)
        lugo1 = Place(name='Lugo', osm_type='relation', osm_id=2001, place_type=PlaceType.MUNICIPALITY, lat=43.01, lon=-7.56)
        lugo2 = Place(name='Lugo', osm_type='node', osm_id=2002, place_type=PlaceType.TOWN, lat=43.02, lon=-7.55)
        coruna = Place(name='A Coruña', osm_type='node', osm_id=3001, place_type=PlaceType.TOWN, lat=43.37, lon=-8.40)
        db.add_all([santiago, lugo1, lugo2, coruna])
        db.commit()
        global coruna_id
        coruna_id = coruna.id
    finally:
        db.close()

    results = []

    def check(name, condition, detail=''):
        status = 'PASS' if condition else 'FAIL'
        results.append((name, status, detail))
        print(f'{status}: {name} {detail}')

    client1 = TestClient(app)
    me1 = login(client1, 'smoke_user1', 'pass12345')
    check('login user1', me1['username'] == 'smoke_user1')

    client2 = TestClient(app)
    me2 = login(client2, 'smoke_user2', 'pass12345')
    check('login user2', me2['username'] == 'smoke_user2')

    # Create project
    r = client1.post('/api/projects/', json={
        'name': 'Camino del Norte',
        'description': 'Proyecto de prueba',
        'visibility': 'all',
        'map_mode': 'auto'
    })
    check('create project', r.status_code == 201)
    project_id = r.json()['id']

    # Bulk import with ambiguous "Lugo"
    r = client1.post(f'/api/projects/{project_id}/bulk-import', json={
        'lines': ['Lugo', 'Santiago de Compostela']
    })
    check('bulk import status', r.status_code == 200)
    lines = r.json()['lines']
    check('bulk import 2 lines', len(lines) == 2)
    check('Lugo ambiguous', lines[0]['status'] == 'ambiguous' and len(lines[0]['candidates']) >= 2)
    check('Santiago resolved', lines[1]['status'] == 'resolved')

    lines[0]['selected'] = lines[0]['candidates'][0]
    r = client1.post(f'/api/projects/{project_id}/bulk-import/confirm', json=lines)
    check('bulk confirm', r.status_code == 200)
    project = r.json()
    check('project has 2 places', len(project['places']) == 2)
    place_ids_in_project = [p['place_id'] for p in project['places']]

    # Seed milestones before project is completed (first call silently
    # records currently-achieved keys and returns an empty list).
    r = client1.post('/api/milestones/check')
    check('milestone seed ok', r.status_code == 200)
    check('milestone seed empty', r.json()['new_milestones'] == [])

    # Upload image for notes
    img = make_image()
    r = client1.post('/api/images/', files={'file': ('test.png', img, 'image/png')})
    check('upload note image', r.status_code == 200)
    img_url = r.json()['url']
    check('image url local', img_url.startswith('/uploads/'))

    # Create associated trip with notes
    r = client1.post('/api/trips/', json={
        'title': 'Viaje por Galicia',
        'start_date': '2026-07-01',
        'end_date': '2026-07-05',
        'visibility': 'all',
        'place_ids': place_ids_in_project,
        'project_ids': [project_id],
        'notes': f'<p>Imagem embebida: <img src="{img_url}" alt="test" loading="lazy"></p>'
    })
    check('create associated trip', r.status_code == 201)
    trip_id = r.json()['id']
    notes = r.json()['notes']
    check('notes keep local img', img_url in notes)

    # Create non-associated trip
    r = client1.post('/api/trips/', json={
        'title': 'Viaje solo a Coruña',
        'start_date': '2026-08-01',
        'end_date': '2026-08-02',
        'visibility': 'all',
        'place_ids': [coruna_id],
    })
    check('create non-associated trip', r.status_code == 201)

    # Project progress after associated trip
    r = client1.get(f'/api/projects/{project_id}')
    project = r.json()
    check('project completed 100%', project['is_completed'] and project['progress_percent'] == 100.0)

    # Trip detail shows project progress
    r = client1.get(f'/api/trips/{trip_id}')
    trip = r.json()
    check('trip detail has project', len(trip['projects']) == 1)
    if trip['projects']:
        check('trip detail project progress', trip['projects'][0]['visited_places'] == 2 and trip['projects'][0]['total_places'] == 2)

    # IDOR: a private project owned by user2 must not be linkable to user1's
    # trip, nor leak through the trip detail of anyone who can see the trip.
    r = client2.post('/api/projects/', json={'name': 'Secreto do user2', 'visibility': 'private', 'map_mode': 'auto'})
    check('user2 private project', r.status_code == 201)
    private_project_id = r.json()['id']
    r = client1.patch(f'/api/trips/{trip_id}', json={'project_ids': [project_id, private_project_id]})
    check('trip update with hidden project id', r.status_code == 200)
    linked = [p['id'] for p in client1.get(f'/api/trips/{trip_id}').json()['projects']]
    check('hidden project not linked', private_project_id not in linked, str(linked))
    check('visible project still linked', project_id in linked)
    r = client1.patch(f'/api/trips/{trip_id}', json={'project_ids': [project_id]})
    check('restore trip projects', r.status_code == 200)

    # Milestone triggered once after completion
    r = client1.post('/api/milestones/check')
    check('milestone check ok', r.status_code == 200)
    milestones = r.json()['new_milestones']
    check('milestone triggered once', len(milestones) == 1 and milestones[0]['project_id'] == project_id)

    r = client1.post('/api/milestones/check')
    check('milestone not repeated', r.json()['new_milestones'] == [])

    # Stats
    r = client1.get('/api/stats/')
    check('stats ok', r.status_code == 200)
    stats = r.json()
    # Stats may include pre-existing public data from other users; verify the
    # smoke user's contributions are present. At this point the smoke user has
    # created two trips ('Viaje por Galicia', 'Viaje solo a Coruña') and one
    # completed project; the private trip is created further below.
    check('stats counts', stats['summary']['trip_count'] >= 2 and stats['summary']['completed_projects'] >= 1)

    # place_type_stats covers EVERY visible visited place, so per type it can
    # never fall below what the top-10 ranking alone accounts for.
    type_totals = {row['place_type']: row['count'] for row in stats['place_type_stats']}
    check('stats place_type_stats shape', isinstance(stats['place_type_stats'], list)
          and all(isinstance(row['count'], int) and row['count'] > 0 for row in stats['place_type_stats']))
    ranking_type_totals = {}
    for row in stats['most_visited']:
        ranking_type_totals[row['place_type']] = ranking_type_totals.get(row['place_type'], 0) + row['visit_count']
    check('stats place_type_stats covers ranking',
          all(type_totals.get(pt, 0) >= count for pt, count in ranking_type_totals.items()))
    check('stats place_type_stats covers all visited places',
          sum(type_totals.values()) >= sum(row['visit_count'] for row in stats['most_visited'])
          and len(type_totals) >= len(ranking_type_totals))

    # Feed
    r = client1.get('/api/activities/')
    check('feed ok', r.status_code == 200)
    feed = r.json()
    check('feed has activities', len(feed) > 0)

    # Search
    r = client1.get('/api/search/?q=Santiago')
    check('search ok', r.status_code == 200)
    search = r.json()
    check('search finds place', len(search['places']) >= 1)

    # Visibility: private trip
    r = client1.post('/api/trips/', json={
        'title': 'Viaje privado',
        'start_date': '2026-09-01',
        'end_date': '2026-09-02',
        'visibility': 'private',
        'place_ids': [coruna_id],
    })
    check('create private trip', r.status_code == 201)
    private_trip_id = r.json()['id']

    r = client2.get('/api/trips/')
    user2_trips = [t['id'] for t in r.json()]
    check('user2 does not see private trip', private_trip_id not in user2_trips)

    r = client2.get(f'/api/trips/{private_trip_id}')
    check('user2 cannot access private trip', r.status_code == 404)

    r = client2.get('/api/search/?q=privado')
    check('user2 search no private trip', r.status_code == 200 and private_trip_id not in [t['id'] for t in r.json()['trips']])

    # Trip date validation: a PATCH carrying a single date must still keep
    # the pair valid (the schema validator only fires when both are sent).
    r = client1.patch(f'/api/trips/{trip_id}', json={'start_date': '2026-07-09'})
    check('patch start after end rejected', r.status_code == 422, r.text[:200])
    r = client1.patch(f'/api/trips/{trip_id}', json={'end_date': '2026-06-01'})
    check('patch end before start rejected', r.status_code == 422, r.text[:200])
    r = client1.get(f'/api/trips/{trip_id}')
    check('trip dates unchanged after rejected patches',
          r.json()['start_date'] == '2026-07-01' and r.json()['end_date'] == '2026-07-05')
    r = client1.patch(f'/api/trips/{trip_id}', json={'start_date': '2026-07-02'})
    check('valid single-date patch accepted', r.status_code == 200 and r.json()['start_date'] == '2026-07-02', r.text[:200])
    r = client1.patch(f'/api/trips/{trip_id}', json={'start_date': '2026-07-01'})
    check('restore trip start date', r.status_code == 200 and r.json()['start_date'] == '2026-07-01')

    # Notification push URLs must use the SPA routes (/viagens, /projetos),
    # not the raw English entity type.
    from app.services import notification_service, push_service
    captured_urls = []
    original_send = push_service.send_to_user

    def _capture_push(_db, _user, payload):
        captured_urls.append(payload.get('url'))

    push_service.send_to_user = _capture_push
    db = SessionLocal()
    try:
        u1 = db.query(User).filter(User.username == 'smoke_user1').one()
        u2 = db.query(User).filter(User.username == 'smoke_user2').one()
        notification_service.notify_participants(
            db, u1, notif_type='trip_created', entity_type='trip', entity_id=4242,
            entity_name='Viagem de teste', participant_ids=[u2.id],
        )
        notification_service.notify_participants(
            db, u1, notif_type='project_created', entity_type='project', entity_id=2424,
            entity_name='Projeto de teste', participant_ids=[u2.id],
        )
    finally:
        push_service.send_to_user = original_send
        db.close()
    check('notification push url uses spa routes', captured_urls == ['/viagens/4242', '/projetos/2424'], str(captured_urls))

    # Trip photos: upload, list, caption, delete, permissions
    r = client1.post(f'/api/trips/{trip_id}/photos/', files=[
        ('files', ('photo1.png', make_image(), 'image/png')),
        ('files', ('photo2.png', make_image(), 'image/png')),
    ])
    check('upload 2 photos', r.status_code == 201 and len(r.json()) == 2, r.text[:200])
    photos = r.json()
    photo_ids = [p['id'] for p in photos]
    check('photo urls local', all(p['url'].startswith('/uploads/') for p in photos))
    deleted_file = settings.uploads_dir / photos[1]['url'].rsplit('/', 1)[-1]

    r = client1.get(f'/api/trips/{trip_id}/photos/')
    check('list photos', r.status_code == 200 and len(r.json()) == 2)

    # A batch with one invalid file must be rejected wholesale (no partial rows).
    r = client1.post(f'/api/trips/{trip_id}/photos/', files=[
        ('files', ('ok.png', make_image(), 'image/png')),
        ('files', ('bad.txt', b'hello', 'text/plain')),
    ])
    check('mixed batch rejected', r.status_code == 422)
    r = client1.get(f'/api/trips/{trip_id}/photos/')
    check('no partial photos after failure', r.status_code == 200 and len(r.json()) == 2)

    r = client1.patch(f'/api/trips/{trip_id}/photos/{photo_ids[0]}', json={'caption': 'Pôr do sol'})
    check('edit photo caption', r.status_code == 200 and r.json()['caption'] == 'Pôr do sol')
    r = client1.get(f'/api/trips/{trip_id}/photos/')
    check('caption persisted', r.json()[0]['caption'] == 'Pôr do sol')

    r = client2.get(f'/api/trips/{private_trip_id}/photos/')
    check('user2 cannot list private trip photos', r.status_code == 404)
    r = client2.post(f'/api/trips/{private_trip_id}/photos/', files=[('files', ('x.png', make_image(), 'image/png'))])
    check('user2 cannot upload to private trip', r.status_code == 404)
    r = client2.patch(f'/api/trips/{trip_id}/photos/{photo_ids[0]}', json={'caption': 'hack'})
    check('user2 cannot edit others photo', r.status_code == 404)

    r = client1.delete(f'/api/trips/{trip_id}/photos/{photo_ids[1]}')
    check('delete photo', r.status_code == 204)
    r = client1.get(f'/api/trips/{trip_id}/photos/')
    check('photo deleted from list', r.status_code == 200 and len(r.json()) == 1)
    check('photo file removed from disk', not deleted_file.exists())

    # Photo reorder (manual gallery order)
    r = client1.post(f'/api/trips/{trip_id}/photos/', files=[
        ('files', ('photo3.png', make_image(), 'image/png')),
        ('files', ('photo4.png', make_image(), 'image/png')),
    ])
    check('upload 2 more photos', r.status_code == 201 and len(r.json()) == 2, r.text[:200])
    r = client1.get(f'/api/trips/{trip_id}/photos/')
    check('photos have positions', all(p['position'] is not None for p in r.json()))
    current_ids = [p['id'] for p in r.json()]
    reversed_ids = list(reversed(current_ids))

    r = client1.put(f'/api/trips/{trip_id}/photos/order', json={'photo_ids': reversed_ids})
    check('reorder photos', r.status_code == 200 and [p['id'] for p in r.json()] == reversed_ids, r.text[:200])
    r = client1.get(f'/api/trips/{trip_id}/photos/')
    check('order persists', [p['id'] for p in r.json()] == reversed_ids)
    check('positions sequential', [p['position'] for p in r.json()] == list(range(len(reversed_ids))))

    r = client1.put(f'/api/trips/{trip_id}/photos/order', json={'photo_ids': reversed_ids[1:]})
    check('reorder rejects missing id', r.status_code == 422)
    r = client1.put(f'/api/trips/{trip_id}/photos/order', json={'photo_ids': reversed_ids + [reversed_ids[0]]})
    check('reorder rejects duplicate id', r.status_code == 422)
    r = client2.put(f'/api/trips/{trip_id}/photos/order', json={'photo_ids': reversed_ids})
    check('user2 cannot reorder', r.status_code == 404)

    # Trip cover photo
    cover_id = reversed_ids[0]
    r = client1.patch(f'/api/trips/{trip_id}', json={'cover_photo_id': cover_id})
    check('set cover', r.status_code == 200 and r.json()['cover_photo_id'] == cover_id, r.text[:200])
    check('cover url in trip response', r.json()['cover_photo_url'].startswith('/uploads/'))
    r = client1.get('/api/trips/')
    trip_row = [t for t in r.json() if t['id'] == trip_id][0]
    check('cover url in trip list', trip_row['cover_photo_url'].startswith('/uploads/'))
    r = client1.patch(f'/api/trips/{trip_id}', json={'cover_photo_id': 999999})
    check('unknown cover photo id 404', r.status_code == 404)
    r = client1.patch(f'/api/trips/{trip_id}', json={'clear_cover': True})
    check('clear cover', r.status_code == 200 and r.json()['cover_photo_id'] is None and r.json()['cover_photo_url'] is None)

    r = client1.patch(f'/api/trips/{trip_id}', json={'cover_photo_id': cover_id})
    check('set cover again', r.status_code == 200)
    r = client1.delete(f'/api/trips/{trip_id}/photos/{cover_id}')
    check('delete cover photo', r.status_code == 204)
    r = client1.get(f'/api/trips/{trip_id}')
    check('cover auto-cleared on photo delete', r.json()['cover_photo_id'] is None and r.json()['cover_photo_url'] is None)

    # EXIF round-trip: capture date + GPS read from the original JPEG bytes
    r = client1.post(f'/api/trips/{trip_id}/photos/', files=[('files', ('exif.jpg', make_image_with_exif(), 'image/jpeg'))])
    check('upload exif photo', r.status_code == 201, r.text[:200])
    exif_photo = r.json()[0]
    check('exif taken_at', exif_photo['taken_at'] is not None and '2023-05-14T10:30:00' in exif_photo['taken_at'], str(exif_photo['taken_at']))
    check('exif gps', abs(exif_photo['lat'] - 42.88) < 0.001 and abs(exif_photo['lon'] + 8.54) < 0.001, str((exif_photo['lat'], exif_photo['lon'])))
    plain_photo = [p for p in client1.get(f'/api/trips/{trip_id}/photos/').json() if p['id'] != exif_photo['id']][0]
    check('no exif on plain photo', plain_photo['taken_at'] is None and plain_photo['lat'] is None)

    # External links (Google Photos / Immich / generic), type auto-detected
    links = [
        {'url': 'https://photos.app.goo.gl/abc123'},
        {'url': 'http://192.168.0.133:2283/album/xyz'},
        {'url': 'https://example.com/gallery'},
    ]
    r = client1.patch(f'/api/trips/{trip_id}', json={'external_links': links})
    check('set external links', r.status_code == 200 and len(r.json()['external_links']) == 3, r.text[:200])
    check('link types detected', [l['type'] for l in r.json()['external_links']] == ['google_photos', 'immich', 'link'], str(r.json()['external_links']))
    r = client1.get(f'/api/trips/{trip_id}')
    check('links in trip detail', [l['url'] for l in r.json()['external_links']] == [l['url'] for l in links])
    r = client1.patch(f'/api/trips/{trip_id}', json={'external_links': links + [{'url': 'https://example.com/one-more'}]})
    check('reject 4th link', r.status_code == 422)
    r = client1.patch(f'/api/trips/{trip_id}', json={'external_links': [{'url': 'not-a-url'}]})
    check('reject invalid link url', r.status_code == 422)
    r = client1.patch(f'/api/trips/{trip_id}', json={'external_links': [links[0], links[0]]})
    check('reject duplicate links', r.status_code == 422)
    r = client2.patch(f'/api/trips/{trip_id}', json={'external_links': links})
    check('user2 cannot set links', r.status_code == 404)
    r = client1.patch(f'/api/trips/{trip_id}', json={'external_links': []})
    check('clear links', r.status_code == 200 and r.json()['external_links'] == [])

    # Deleting a trip must delete its photos (rows + files on disk)
    r = client1.post('/api/trips/', json={
        'title': 'Viaje con fotos',
        'start_date': '2026-10-01',
        'end_date': '2026-10-03',
        'place_ids': [coruna_id],
    })
    check('create trip for photo-delete test', r.status_code == 201)
    photo_trip_id = r.json()['id']
    r = client1.post(f'/api/trips/{photo_trip_id}/photos/', files=[
        ('files', ('p1.png', make_image(), 'image/png')),
        ('files', ('p2.png', make_image(), 'image/png')),
    ])
    check('upload photos to doomed trip', r.status_code == 201 and len(r.json()) == 2, r.text[:200])
    doomed_photos = r.json()
    doomed_files = [settings.uploads_dir / p['url'].rsplit('/', 1)[-1] for p in doomed_photos]
    r = client1.patch(f'/api/trips/{photo_trip_id}', json={'cover_photo_id': doomed_photos[0]['id']})
    check('set cover on doomed trip', r.status_code == 200)

    r = client1.delete(f'/api/trips/{photo_trip_id}')
    check('delete trip with photos', r.status_code == 204, r.text[:200])
    r = client1.get(f'/api/trips/{photo_trip_id}')
    check('doomed trip gone', r.status_code == 404)
    r = client1.get(f'/api/trips/{photo_trip_id}/photos/')
    check('photos gone with trip', r.status_code == 404)
    check('photo files removed with trip', all(not f.exists() for f in doomed_files))

    # --- Audit fixes (2026-11) ---

    # Fix 3: a participant of a SPECIFIC entity who is not in visible_users
    # cannot edit through a leaked id (404, same as not being able to see).
    me2_id = me2['id']
    r = client1.post('/api/trips/', json={
        'title': 'Viaje specific',
        'start_date': '2026-09-10',
        'end_date': '2026-09-11',
        'visibility': 'specific',
        'participant_ids': [me2_id],
        'place_ids': [coruna_id],
    })
    check('create specific trip with invisible participant', r.status_code == 201, r.text[:200])
    specific_trip_id = r.json()['id']
    r = client2.patch(f'/api/trips/{specific_trip_id}', json={'title': 'hackeado'})
    check('invisible participant cannot edit trip', r.status_code == 404, r.text[:200])
    r = client2.post(f'/api/trips/{specific_trip_id}/photos/', files=[('files', ('x.png', make_image(), 'image/png'))])
    check('invisible participant cannot upload photos', r.status_code == 404)
    r = client1.post('/api/projects/', json={
        'name': 'Proj specific', 'visibility': 'specific', 'map_mode': 'auto', 'participant_ids': [me2_id],
    })
    check('create specific project with invisible participant', r.status_code == 201, r.text[:200])
    specific_project_id = r.json()['id']
    r = client2.patch(f'/api/projects/{specific_project_id}', json={'name': 'hackeado'})
    check('invisible participant cannot edit project', r.status_code == 404, r.text[:200])
    # Once added to visible_users the same participant CAN edit.
    r = client1.patch(f'/api/trips/{specific_trip_id}', json={'visible_user_ids': [me2_id]})
    check('grant visibility to participant', r.status_code == 200)
    r = client2.patch(f'/api/trips/{specific_trip_id}', json={'title': 'Editado pelo participante'})
    check('visible participant can edit trip', r.status_code == 200, r.text[:200])
    r = client1.delete(f'/api/trips/{specific_trip_id}')
    check('cleanup specific trip', r.status_code == 204)
    r = client1.delete(f'/api/projects/{specific_project_id}')
    check('cleanup specific project', r.status_code == 204)

    # Fix 9: pins pointing at a deleted entity are removed with it.
    r = client1.post('/api/trips/', json={
        'title': 'Viaje pinneado',
        'start_date': '2026-10-10',
        'end_date': '2026-10-11',
        'visibility': 'all',
        'place_ids': [coruna_id],
    })
    pinned_trip_id = r.json()['id']
    r = client1.post('/api/pins/', json={'entity_type': 'trip', 'entity_id': pinned_trip_id})
    check('pin trip (user1)', r.status_code == 201, r.text[:200])
    r = client2.post('/api/pins/', json={'entity_type': 'trip', 'entity_id': pinned_trip_id})
    check('pin trip (user2)', r.status_code == 201, r.text[:200])
    r = client1.delete(f'/api/trips/{pinned_trip_id}')
    check('delete pinned trip', r.status_code == 204)
    r = client1.get('/api/pins/')
    check('user1 pin removed with trip', all(p['entity_id'] != pinned_trip_id for p in r.json()))
    r = client2.get('/api/pins/')
    check('user2 pin removed with trip', all(p['entity_id'] != pinned_trip_id for p in r.json()))

    r = client1.post('/api/projects/', json={'name': 'Proj pinneado', 'visibility': 'all', 'map_mode': 'auto'})
    pinned_project_id = r.json()['id']
    r = client1.post('/api/pins/', json={'entity_type': 'project', 'entity_id': pinned_project_id})
    check('pin project', r.status_code == 201, r.text[:200])
    r = client1.delete(f'/api/projects/{pinned_project_id}')
    check('delete pinned project', r.status_code == 204)
    r = client1.get('/api/pins/')
    check('project pin removed with project', all(p['entity_id'] != pinned_project_id for p in r.json()))

    # Fix 6: a deletion record of a private entity is only kept for its actor.
    r = client1.post('/api/trips/', json={
        'title': 'Privado efímero',
        'start_date': '2026-11-01',
        'end_date': '2026-11-02',
        'visibility': 'private',
        'place_ids': [coruna_id],
    })
    eph_trip_id = r.json()['id']
    r = client1.delete(f'/api/trips/{eph_trip_id}')
    check('delete ephemeral private trip', r.status_code == 204)
    r = client2.get('/api/activities/')
    check('deleted private trip hidden from others feed',
          all(a['entity_name'] != 'Privado efímero' for a in r.json()))
    r = client1.get('/api/activities/')
    check('actor keeps deletion record',
          any(a['entity_type'] == 'trip' and a['entity_id'] == eph_trip_id and a['action'] == 'deleted' for a in r.json()))

    # Fix 7: images over the pixel budget are rejected from the header alone
    # (decompression-bomb guard), leaving no row and no file behind.
    r = client1.get(f'/api/trips/{trip_id}/photos/')
    photos_before = len(r.json())
    big = Image.new('RGB', (8200, 5000), color='green')  # 41 Mpx > 40 Mpx
    big_buf = BytesIO()
    big.save(big_buf, format='PNG')
    big_buf.seek(0)
    r = client1.post(f'/api/trips/{trip_id}/photos/', files=[('files', ('huge.png', big_buf, 'image/png'))])
    check('oversized-pixel image rejected', r.status_code == 400, r.text[:200])
    r = client1.get(f'/api/trips/{trip_id}/photos/')
    check('no photo row after rejected upload', len(r.json()) == photos_before)

    # Fix 1: deleting a user whose trips have photos (or who uploaded photos
    # to someone else's trip) must not 500, and must clean rows + files.
    db = SessionLocal()
    try:
        user3 = create_user(db, 'smoke_user3', 'pass12345')
        user3_id = user3.id
    finally:
        db.close()
    client4 = TestClient(app)
    login(client4, 'smoke_user3', 'pass12345')

    r = client4.post('/api/trips/', json={
        'title': 'Viaje del user3',
        'start_date': '2026-11-05',
        'end_date': '2026-11-06',
        'place_ids': [coruna_id],
    })
    check('user3 creates trip', r.status_code == 201, r.text[:200])
    user3_trip_id = r.json()['id']
    r = client4.post(f'/api/trips/{user3_trip_id}/photos/', files=[('files', ('u3.png', make_image(), 'image/png'))])
    check('user3 uploads photo', r.status_code == 201, r.text[:200])
    user3_photo = r.json()[0]
    user3_photo_file = settings.uploads_dir / user3_photo['url'].rsplit('/', 1)[-1]
    r = client4.patch(f'/api/trips/{user3_trip_id}', json={'cover_photo_id': user3_photo['id']})
    check('user3 sets cover', r.status_code == 200)

    # user3 also uploads a photo to user1's trip (as participant) and user1
    # uses it as the trip cover.
    r = client1.patch(f'/api/trips/{trip_id}', json={'participant_ids': [user3_id]})
    check('user1 adds user3 as participant', r.status_code == 200, r.text[:200])
    r = client4.post(f'/api/trips/{trip_id}/photos/', files=[('files', ('u3foreign.png', make_image(), 'image/png'))])
    check('user3 uploads to user1 trip', r.status_code == 201, r.text[:200])
    foreign_photo = r.json()[0]
    foreign_photo_file = settings.uploads_dir / foreign_photo['url'].rsplit('/', 1)[-1]
    r = client1.patch(f'/api/trips/{trip_id}', json={'cover_photo_id': foreign_photo['id']})
    check('user1 covers with user3 photo', r.status_code == 200, r.text[:200])

    r = client4.delete('/api/me/')
    check('delete account with photos', r.status_code == 204, r.text[:200])
    r = client4.get('/api/me/')
    check('deleted user session invalid', r.status_code == 401)

    db = SessionLocal()
    try:
        check('user3 gone from db', db.query(User).filter(User.id == user3_id).first() is None)
        check('user3 trip gone', db.query(Trip).filter(Trip.id == user3_trip_id).first() is None)
        check('user3 photo rows gone', db.query(Photo).filter(Photo.uploader_id == user3_id).count() == 0)
        check('user1 trip cover cleared after user deletion',
              db.query(Trip).filter(Trip.id == trip_id).one().cover_photo_id is None)
    finally:
        db.close()
    check('user3 photo files removed', not user3_photo_file.exists() and not foreign_photo_file.exists())
    r = client1.get(f'/api/trips/{trip_id}/photos/')
    check('foreign photo gone from user1 trip', all(p['id'] != foreign_photo['id'] for p in r.json()))

    # Manual unmark a place in project
    place_to_unmark = place_ids_in_project[0]
    r = client1.post(f'/api/projects/{project_id}/places/{place_to_unmark}/unmark')
    check('manual unmark', r.status_code == 200)
    r = client1.get(f'/api/projects/{project_id}')
    detail = r.json()
    check('progress after unmark', detail['visited_places'] == 1 and not detail['is_completed'])
    unmarked_row = next(p for p in detail['places'] if p['place_id'] == place_to_unmark)
    check('unmarked place has no visited_at', unmarked_row['is_unmarked'] and unmarked_row['visited_at'] is None)

    # Re-mark
    r = client1.post(f'/api/projects/{project_id}/places/{place_to_unmark}/unmark')
    check('re-mark', r.status_code == 200)
    r = client1.get(f'/api/projects/{project_id}')
    detail = r.json()
    check('progress after re-mark', detail['visited_places'] == 2 and detail['is_completed'])
    # visited_at must be the real last visit date (trip end_date), not the
    # date the place was added to the project.
    check('visited_at is the trip end date',
          all(p['visited_at'] == '2026-07-05' for p in detail['places'] if p['is_visited']))

    # Preferences
    r = client1.patch('/api/me/', json={'timezone': 'Europe/Madrid', 'date_format': '%Y-%m-%d', 'theme': 'dark'})
    check('update preferences', r.status_code == 200)
    check('preferences persisted', r.json()['timezone'] == 'Europe/Madrid' and r.json()['date_format'] == '%Y-%m-%d' and r.json()['theme'] == 'dark')

    # Avatar
    img = make_image()
    r = client1.post('/api/me/avatar', files={'file': ('avatar.png', img, 'image/png')})
    check('upload avatar', r.status_code == 200)
    check('avatar url', r.json()['avatar_url'].startswith('/uploads/'))
    first_avatar_file = settings.uploads_dir / r.json()['avatar_url'].rsplit('/', 1)[-1]
    img = make_image()
    r = client1.post('/api/me/avatar', files={'file': ('avatar2.png', img, 'image/png')})
    check('replace avatar', r.status_code == 200)
    check('old avatar file removed', not first_avatar_file.exists())

    # Uploads are private user content: no session → 401; with a session the
    # file is served with a private cache policy.
    avatar_url = r.json()['avatar_url']
    anon_client = TestClient(app)
    r = anon_client.get(avatar_url)
    check('uploads require auth', r.status_code == 401, r.text[:200])
    r = client1.get(avatar_url)
    check('uploads served with session', r.status_code == 200)
    check('uploads cache is private', r.headers.get('cache-control', '').startswith('private'), r.headers.get('cache-control'))

    # Password change
    r = client1.post('/api/me/password', json={'current_password': 'pass12345', 'new_password': 'newpass123'})
    check('change password', r.status_code == 200)

    client3 = TestClient(app)
    r = client3.post('/api/auth/login', json={'username': 'smoke_user1', 'password': 'newpass123'})
    check('login with new password', r.status_code == 200)

    # Last-admin protection: the sole active admin can neither be demoted
    # nor deactivated. Only exercised when the seeded default admin is the
    # only active one (skipped otherwise, never mutating a real account).
    db = SessionLocal()
    try:
        sole_admin_id = next(
            (u.id for u in db.query(User).filter(User.role == UserRole.ADMIN, User.is_active == True).all() if u.username == settings.default_admin_username),
            None,
        )
        other_admins = db.query(User).filter(User.role == UserRole.ADMIN, User.is_active == True, User.username != settings.default_admin_username).count()
    finally:
        db.close()
    if sole_admin_id is not None and other_admins == 0:
        client_admin = TestClient(app)
        r = client_admin.post('/api/auth/login', json={'username': settings.default_admin_username, 'password': settings.default_admin_password})
        if r.status_code == 200:
            client_admin.headers.update({'x-csrf-token': r.json()['csrf_token']})
            r = client_admin.patch(f'/api/users/{sole_admin_id}', json={'role': 'user'})
            check('last admin cannot be demoted', r.status_code == 422, r.text[:200])
            r = client_admin.patch(f'/api/users/{sole_admin_id}', json={'is_active': False})
            check('last admin cannot be deactivated', r.status_code == 422, r.text[:200])
            # Invalid username charset must surface as 400, not a 500.
            r = client_admin.patch(f'/api/users/{sole_admin_id}', json={'username': 'bad name!'})
            check('invalid username returns 400', r.status_code == 400, r.text[:200])
            r = client_admin.post('/api/users/', json={'username': 'also bad!', 'password': 'pass12345'})
            check('invalid username create returns 400', r.status_code == 400, r.text[:200])
        else:
            check('last admin cannot be demoted', True, 'skipped: default admin password changed')
            check('last admin cannot be deactivated', True, 'skipped: default admin password changed')
    else:
        check('last admin cannot be demoted', True, 'skipped: default admin is not the sole active admin')
        check('last admin cannot be deactivated', True, 'skipped: default admin is not the sole active admin')

    # User directory: non-admins cannot call the admin list, but can fetch
    # the minimal active-user directory needed by trip/project edit forms.
    r = client1.get('/api/users/')
    check('non-admin blocked from /api/users/', r.status_code == 403, f'{r.status_code}: {r.text[:120]}')
    r = client1.get('/api/users/directory')
    check('non-admin can read /api/users/directory', r.status_code == 200, f'{r.status_code}: {r.text[:120]}')
    if r.status_code == 200:
        directory = r.json()
        usernames = {u['username'] for u in directory}
        check('directory includes active users', 'smoke_user1' in usernames and 'smoke_user2' in usernames, str(usernames))
        check('directory omits admin-only fields', all(set(u.keys()) == {'id', 'username', 'avatar_url'} for u in directory), str(directory[:2]))
        db = SessionLocal()
        try:
            admin_users = db.query(User).filter(User.role == UserRole.ADMIN).all()
            admin_ids = [a.id for a in admin_users]
            admin_names = {a.username for a in admin_users}
        finally:
            db.close()
        check('directory excludes admin users', usernames.isdisjoint(admin_names), str(usernames & admin_names))
        if admin_ids:
            r_adm = client1.post('/api/projects/', json={
                'name': 'Sem Admin', 'visibility': 'specific', 'map_mode': 'auto',
                'participant_ids': [admin_ids[0]], 'visible_user_ids': [admin_ids[0]],
            })
            check('project creation ignores admin invite',
                  r_adm.status_code == 201
                  and r_adm.json()['participants'] == []
                  and r_adm.json()['visible_users'] == [],
                  r_adm.text[:200])
            if r_adm.status_code == 201:
                client1.delete(f"/api/projects/{r_adm.json()['id']}")

    # Security headers on API responses (HSTS only when session cookies are
    # Secure, i.e. production).
    r = client1.get('/api/health')
    check('security headers present',
          r.headers.get('x-content-type-options') == 'nosniff'
          and r.headers.get('x-frame-options') == 'DENY'
          and r.headers.get('referrer-policy') == 'strict-origin-when-cross-origin',
          str({k: v for k, v in r.headers.items() if k.startswith('x-') or k in ('referrer-policy', 'strict-transport-security')}))
    check('HSTS matches secure-cookie setting',
          ('strict-transport-security' in r.headers) == settings.session_cookie_secure_resolved)

    # Login rate limiting: max 5 failed attempts per IP in a rolling 5-minute
    # window, then 429; a successful login resets the failure counter.
    rl_client = TestClient(app)
    wrong3 = [
        rl_client.post('/api/auth/login', json={'username': 'smoke_user1', 'password': 'wrong'}).status_code
        for _ in range(3)
    ]
    check('wrong passwords rejected', wrong3 == [401] * 3, str(wrong3))
    r = rl_client.post('/api/auth/login', json={'username': 'smoke_user1', 'password': 'newpass123'})
    check('login ok before limit', r.status_code == 200, r.text[:200])
    # Without the reset above, failure #3 below would already trigger 429
    # (3 pre-existing + 2 new); getting 401s proves the counter was reset.
    reset_proof = [
        rl_client.post('/api/auth/login', json={'username': 'smoke_user1', 'password': 'wrong'}).status_code
        for _ in range(3)
    ]
    check('counter reset after success', reset_proof == [401] * 3, str(reset_proof))
    wrong2 = [
        rl_client.post('/api/auth/login', json={'username': 'smoke_user1', 'password': 'wrong'}).status_code
        for _ in range(2)
    ]
    check('5 failures allowed', wrong2 == [401] * 2, str(wrong2))
    r = rl_client.post('/api/auth/login', json={'username': 'smoke_user1', 'password': 'wrong'})
    check('6th failed attempt rate limited', r.status_code == 429, r.text[:200])

    # Persistence check via fresh DB session
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.username == 'smoke_user1').first()
        check('user persisted', u is not None)
        check('theme persisted', u.theme.value == 'dark')
        check('timezone persisted', u.timezone == 'Europe/Madrid')
        projects = db.query(Project).filter(Project.creator_id == u.id).all()
        check('projects persisted', len(projects) == 1)
        trips = db.query(Trip).filter(Trip.creator_id == u.id).all()
        check('trips persisted', len(trips) >= 3)
    finally:
        db.close()

    # --- Adversarial / dynamic tests (2026-11-18) ---
    # The rate-limit probes above leave 6 fresh failures on the shared
    # 'testclient' IP; without a reset, every later login in this run would
    # get a 429. The limiter is in-process, so clearing it here is enough.
    from app.routers.auth import _login_attempts, _login_failures
    _login_attempts.clear()
    _login_failures.clear()

    # A dedicated client that surfaces unhandled server exceptions as 500
    # responses instead of raising, so each probe records a FAIL instead of
    # crashing the whole run.
    adv = TestClient(app, raise_server_exceptions=False)
    login(adv, 'smoke_user1', 'newpass123')

    # The lightweight migrations already ran twice by now (script top + app
    # lifespan); a further explicit run must still be a no-op.
    try:
        _apply_lightweight_migrations()
        check('migrations idempotent rerun', True)
    except Exception as e:
        check('migrations idempotent rerun', False, repr(e))

    # Ids outside SQLite's int64 range must produce a clean 4xx, never a 500
    # (the driver raises OverflowError when binding them).
    HUGE = 10 ** 20
    r = adv.get(f'/api/trips/{HUGE}')
    check('giant trip id no 500', r.status_code in (404, 422), str(r.status_code))
    r = adv.get(f'/api/projects/{HUGE}')
    check('giant project id no 500', r.status_code in (404, 422), str(r.status_code))
    r = adv.get(f'/api/places/{HUGE}')
    check('giant place id no 500', r.status_code in (404, 422), str(r.status_code))
    r = adv.patch(f'/api/trips/{trip_id}', json={'cover_photo_id': HUGE})
    check('giant cover photo id no 500', r.status_code in (404, 422), str(r.status_code))
    r = adv.post('/api/pins/', json={'entity_type': 'trip', 'entity_id': HUGE})
    check('giant pin entity id no 500', r.status_code in (404, 422), str(r.status_code))
    r = adv.post('/api/notifications/read', json={'ids': [HUGE]})
    check('giant notification id no 500', r.status_code in (200, 422), str(r.status_code))

    # Negative and zero ids are simply not found.
    check('negative trip id 404', adv.get('/api/trips/-1').status_code == 404)
    check('zero trip id 404', adv.get('/api/trips/0').status_code == 404)
    check('negative place id 404', adv.get('/api/places/-5').status_code == 404)
    check('zero photo id 404', adv.patch(f'/api/trips/{trip_id}/photos/0', json={'caption': 'x'}).status_code == 404)

    # Dates: inverted on create, absurd-but-valid years, invalid strings.
    r = adv.post('/api/trips/', json={'title': 'Invertido', 'start_date': '2026-07-05', 'end_date': '2026-07-01'})
    check('create inverted dates 422', r.status_code == 422, r.text[:200])
    r = adv.post('/api/trips/', json={'title': 'Ano 9999', 'start_date': '9999-12-31'})
    check('year 9999 no 500', r.status_code == 201, r.text[:200])
    if r.status_code == 201:
        adv.delete(f"/api/trips/{r.json()['id']}")
    r = adv.post('/api/trips/', json={'title': 'Ano 1', 'start_date': '0001-01-01'})
    check('year 1 no 500', r.status_code == 201, r.text[:200])
    if r.status_code == 201:
        adv.delete(f"/api/trips/{r.json()['id']}")
    check('invalid date string 422', adv.patch(f'/api/trips/{trip_id}', json={'start_date': 'não-é-data'}).status_code == 422)
    check('impossible date 422', adv.post('/api/trips/', json={'start_date': '2026-02-30'}).status_code == 422)

    # Types and malformed payloads must be 422, never 500.
    check('place_ids string 422', adv.post('/api/trips/', json={'start_date': '2026-07-01', 'place_ids': 'abc'}).status_code == 422)
    check('participant id bad type 422', adv.post('/api/trips/', json={'start_date': '2026-07-01', 'participant_ids': [1, 'x']}).status_code == 422)
    check('bogus visibility 422', adv.post('/api/trips/', json={'start_date': '2026-07-01', 'visibility': 'everyone'}).status_code == 422)
    r = adv.post('/api/trips/', content=b'{"title":', headers={'content-type': 'application/json'})
    check('malformed json 422', r.status_code == 422, str(r.status_code))
    check('array instead of object 422', adv.post('/api/trips/', json=['não', 'é', 'objeto']).status_code == 422)

    # Length limits and extreme unicode.
    check('10k title 422', adv.post('/api/trips/', json={'title': 'x' * 10_000, 'start_date': '2026-07-01'}).status_code == 422)
    check('256 project name 422', adv.post('/api/projects/', json={'name': 'y' * 256}).status_code == 422)
    unicode_title = 'Foguete 🚀 עברית é'
    r = adv.post('/api/trips/', json={'title': unicode_title, 'start_date': '2026-07-01'})
    check('unicode title accepted', r.status_code == 201, r.text[:200])
    if r.status_code == 201:
        unicode_trip_id = r.json()['id']
        check('unicode title round-trips', adv.get(f'/api/trips/{unicode_trip_id}').json()['title'] == unicode_title)
        adv.delete(f'/api/trips/{unicode_trip_id}')
    r = adv.post('/api/trips/', json={'title': 'NUL', 'start_date': '2026-07-01', 'notes': 'abc\x00def'})
    check('NUL byte in notes no 500', r.status_code == 201, str(r.status_code))
    if r.status_code == 201:
        adv.delete(f"/api/trips/{r.json()['id']}")

    # LIKE metacharacters in the search query must be treated literally.
    r = adv.get('/api/search/', params={'q': '__'})
    check('search underscores not wildcard',
          r.status_code == 200 and r.json()['places'] == [] and r.json()['trips'] == [],
          str(r.json())[:200])
    r = adv.get('/api/search/', params={'q': '%%'})
    check('search percent not wildcard',
          r.status_code == 200 and r.json()['places'] == [] and r.json()['trips'] == [],
          str(r.json())[:200])
    from app.services import place_service
    db = SessionLocal()
    try:
        check('cached place search escapes wildcards', place_service.find_cached_places(db, '__') == [])
    finally:
        db.close()

    # Pagination bounds.
    check('activities limit=0 422', adv.get('/api/activities/', params={'limit': 0}).status_code == 422)
    check('activities limit=-1 422', adv.get('/api/activities/', params={'limit': -1}).status_code == 422)
    check('activities limit huge 422', adv.get('/api/activities/', params={'limit': 10 ** 9}).status_code == 422)
    r = adv.get('/api/activities/', params={'limit': 1})
    check('activities limit=1 ok', r.status_code == 200 and len(r.json()) <= 1)
    check('places limit=-1 422', adv.get('/api/places/', params={'limit': -1}).status_code == 422)
    r = adv.get('/api/places/', params={'limit': 0})
    check('places limit=0 empty ok', r.status_code == 200 and r.json() == [])
    check('places offset=-1 422', adv.get('/api/places/', params={'offset': -1}).status_code == 422)
    check('places limit=501 422', adv.get('/api/places/', params={'limit': 501}).status_code == 422)

    # Place import: coordinates must be finite and in range (a NaN would be
    # stored and later serialised as invalid JSON, breaking every client).
    nan_place = {'osm_type': 'node', 'osm_id': 900001, 'name': 'NaN Island', 'place_type': 'outro', 'lat': float('nan'), 'lon': 0.0}
    check('NaN latitude 422', adv.post('/api/places/import', json=nan_place).status_code == 422)
    check('latitude 91 422', adv.post('/api/places/import', json={**nan_place, 'lat': 91.0}).status_code == 422)
    check('longitude -181 422', adv.post('/api/places/import', json={**nan_place, 'lat': 0.0, 'lon': -181.0}).status_code == 422)
    r = adv.post('/api/places/import', json={
        'osm_type': 'node', 'osm_id': 900002, 'name': 'Polo Norte Teste',
        'place_type': 'outro', 'lat': 90.0, 'lon': 180.0,
    })
    check('edge coordinates accepted', r.status_code == 200, r.text[:200])

    # External links: duplicates differing only by trailing slash or by
    # scheme/host case are still duplicates.
    r = adv.patch(f'/api/trips/{trip_id}', json={'external_links': [
        {'url': 'https://example.com/x'}, {'url': 'https://example.com/x/'},
    ]})
    check('duplicate link trailing slash 422', r.status_code == 422, r.text[:200])
    r = adv.patch(f'/api/trips/{trip_id}', json={'external_links': [
        {'url': 'https://EXAMPLE.com/x'}, {'url': 'https://example.com/x'},
    ]})
    check('duplicate link host case 422', r.status_code == 422, r.text[:200])

    # Photo upload abuse: 15 MB + 1 byte, and an executable with an image
    # content-type (content sniffing must reject it cleanly).
    oversized = b'\x89PNG\r\n\x1a\n' + b'\x00' * settings.max_upload_bytes
    r = adv.post(f'/api/trips/{trip_id}/photos/', files=[('files', ('big.png', oversized, 'image/png'))])
    check('15MB+1 upload rejected 413', r.status_code == 413, str(r.status_code))
    exe = b'MZ\x90\x00' + b'\x00' * 200
    photos_before = len(adv.get(f'/api/trips/{trip_id}/photos/').json())
    r = adv.post(f'/api/trips/{trip_id}/photos/', files=[('files', ('evil.png', exe, 'image/png'))])
    check('exe as png rejected 400', r.status_code == 400, r.text[:200])
    check('no photo row after exe', len(adv.get(f'/api/trips/{trip_id}/photos/').json()) == photos_before)

    trip_photos_now = adv.get(f'/api/trips/{trip_id}/photos/').json()
    first_photo_id = trip_photos_now[0]['id']
    check('caption 513 chars 422', adv.patch(f'/api/trips/{trip_id}/photos/{first_photo_id}', json={'caption': 'c' * 513}).status_code == 422)
    r = adv.patch(f'/api/trips/{trip_id}/photos/{first_photo_id}', json={'caption': 'Legenda 🌍'})
    check('emoji caption ok', r.status_code == 200 and r.json()['caption'] == 'Legenda 🌍', r.text[:200])

    # Reorder must reject a foreign photo id (from another trip), not just
    # missing/duplicate ids.
    r = adv.post('/api/trips/', json={'title': 'Viaje B', 'start_date': '2026-11-10', 'place_ids': [coruna_id]})
    check('create trip B', r.status_code == 201, r.text[:200])
    trip_b_id = r.json()['id']
    r = adv.post(f'/api/trips/{trip_b_id}/photos/', files=[('files', ('b.png', make_image(), 'image/png'))])
    check('photo on trip B', r.status_code == 201, r.text[:200])
    foreign_photo_id = r.json()[0]['id']
    current_photo_ids = [p['id'] for p in adv.get(f'/api/trips/{trip_id}/photos/').json()]
    r = adv.put(f'/api/trips/{trip_id}/photos/order', json={'photo_ids': current_photo_ids[:-1] + [foreign_photo_id]})
    check('reorder rejects foreign photo id', r.status_code == 422, r.text[:200])
    r = adv.delete(f'/api/trips/{trip_b_id}')
    check('cleanup trip B', r.status_code == 204)

    # Pins: documented cap (2 per type), invalid entity type, double unpin.
    check('pin trip 1', adv.post('/api/pins/', json={'entity_type': 'trip', 'entity_id': trip_id}).status_code == 201)
    check('pin trip 2', adv.post('/api/pins/', json={'entity_type': 'trip', 'entity_id': private_trip_id}).status_code == 201)
    r = adv.post('/api/trips/', json={'title': 'Terceira', 'start_date': '2026-11-11', 'place_ids': [coruna_id]})
    third_trip_id = r.json()['id']
    r = adv.post('/api/pins/', json={'entity_type': 'trip', 'entity_id': third_trip_id})
    check('third pin 409', r.status_code == 409, r.text[:200])
    check('pin place 422', adv.post('/api/pins/', json={'entity_type': 'place', 'entity_id': coruna_id}).status_code == 422)
    check('unpin trip 1', adv.delete(f'/api/pins/trip/{trip_id}').status_code == 204)
    check('double unpin 404', adv.delete(f'/api/pins/trip/{trip_id}').status_code == 404)
    adv.delete(f'/api/pins/trip/{private_trip_id}')
    adv.delete(f'/api/trips/{third_trip_id}')

    # Referential integrity: deleting a project linked to a trip cleans the
    # relation rows and the trip detail.
    r = adv.post('/api/projects/', json={'name': 'Proj ligado', 'visibility': 'all', 'map_mode': 'auto'})
    linked_project_id = r.json()['id']
    r = adv.post('/api/trips/', json={
        'title': 'Viaje ligado', 'start_date': '2026-11-12',
        'place_ids': [coruna_id], 'project_ids': [linked_project_id],
    })
    linked_trip_id = r.json()['id']
    check('trip linked to project', len(adv.get(f'/api/trips/{linked_trip_id}').json()['projects']) == 1)
    r = adv.delete(f'/api/projects/{linked_project_id}')
    check('delete linked project', r.status_code == 204, r.text[:200])
    check('trip projects cleaned after project delete',
          adv.get(f'/api/trips/{linked_trip_id}').json()['projects'] == [])
    db = SessionLocal()
    try:
        check('no dangling trip_project rows',
              db.query(TripProject).filter(TripProject.project_id == linked_project_id).count() == 0)
    finally:
        db.close()
    adv.delete(f'/api/trips/{linked_trip_id}')

    # A deleted user must disappear from participants/visible_users of trips
    # they were attached to (user3 was a participant of trip_id and was
    # deleted earlier in this run).
    r = adv.get(f'/api/trips/{trip_id}')
    check('deleted user not in participants', all(p['id'] != user3_id for p in r.json()['participants']))
    check('deleted user not in visible users', all(u['id'] != user3_id for u in r.json()['visible_users']))

    # Same-name create → delete → create is allowed (names are not unique).
    r = adv.post('/api/projects/', json={'name': 'Projeto Efémero'})
    check('create ephemeral project', r.status_code == 201)
    eph_id = r.json()['id']
    check('delete ephemeral project', adv.delete(f'/api/projects/{eph_id}').status_code == 204)
    r = adv.post('/api/projects/', json={'name': 'Projeto Efémero'})
    check('recreate same-name project', r.status_code == 201, r.text[:200])
    if r.status_code == 201:
        adv.delete(f"/api/projects/{r.json()['id']}")

    # Mark-as-read must only affect the caller's own notifications.
    r = client2.get('/api/notifications/')
    user2_notif_ids = [n['id'] for n in r.json()['notifications']]
    user2_unread_before = r.json()['unread_count']
    r = adv.post('/api/notifications/read', json={'ids': user2_notif_ids})
    check('mark read call ok', r.status_code == 200, r.text[:200])
    r = client2.get('/api/notifications/unread-count')
    check('cross-user mark_read is no-op', r.json()['unread_count'] == user2_unread_before, str(r.json()))

    # Auth/session edge cases.
    anon = TestClient(app, raise_server_exceptions=False)
    check('mutation without session 401',
          anon.post('/api/trips/', json={'start_date': '2026-07-01'}).status_code == 401)
    check('read without session 401', anon.get('/api/notifications/').status_code == 401)

    no_csrf = TestClient(app, raise_server_exceptions=False)
    login(no_csrf, 'smoke_user1', 'newpass123')
    no_csrf.headers.pop('x-csrf-token')
    check('mutation without csrf 403', no_csrf.post('/api/trips/', json={'start_date': '2026-07-01'}).status_code == 403)
    check('read without csrf ok', no_csrf.get('/api/trips/').status_code == 200)
    no_csrf.headers.update({'x-csrf-token': 'token-errado'})
    check('mutation wrong csrf 403', no_csrf.post('/api/trips/', json={'start_date': '2026-07-01'}).status_code == 403)

    # An expired session is rejected and pruned from the table.
    sess_client = TestClient(app, raise_server_exceptions=False)
    login(sess_client, 'smoke_user1', 'newpass123')
    sess_token = sess_client.cookies.get(settings.session_cookie_name)
    db = SessionLocal()
    try:
        from app.models import Session as UserSession
        from datetime import datetime, timedelta, timezone
        row = db.query(UserSession).filter(UserSession.token == sess_token).one()
        row.expires_at = datetime.now(timezone.utc) - timedelta(days=1)
        db.commit()
    finally:
        db.close()
    check('expired session 401', sess_client.get('/api/me/').status_code == 401)
    db = SessionLocal()
    try:
        check('expired session pruned',
              db.query(UserSession).filter(UserSession.token == sess_token).first() is None)
    finally:
        db.close()

    # Logout invalidates the session server-side.
    out_client = TestClient(app, raise_server_exceptions=False)
    login(out_client, 'smoke_user1', 'newpass123')
    check('logout ok', out_client.post('/api/auth/logout').status_code == 200)
    check('session dead after logout', out_client.get('/api/me/').status_code == 401)

    # Username uniqueness is case-insensitive (both stored lowercased).
    r = adv.patch('/api/me/', json={'username': 'SMOKE_USER2'})
    check('username duplicate other case 409', r.status_code == 409, r.text[:200])

    # Tile validation happens before any upstream request.
    check('tile zoom 20 rejected', adv.get('/api/tiles/light/20/0/0.png').status_code == 400)
    check('tile negative zoom rejected', adv.get('/api/tiles/light/-1/0/0.png').status_code == 400)
    check('tile bogus style rejected', adv.get('/api/tiles/blue/5/0/0.png').status_code == 400)

    # Immich integration (works cleanly both with Immich disabled and with mocked/bad IDs)
    r = adv.get('/api/immich/status')
    check('immich status 200', r.status_code == 200 and 'enabled' in r.json(), r.text[:200])
    immich_enabled = r.json().get('enabled', False)
    if not immich_enabled:
        check('immich albums 503 when disabled', adv.get('/api/immich/albums').status_code == 503)
    check('immich bad asset id 422', adv.get('/api/immich/assets/bad!id/thumbnail').status_code == 422)

    r_trip = adv.post('/api/trips/', json={'start_date': '2026-05-01', 'title': 'Immich Smoke'})
    check('immich test trip created', r_trip.status_code == 201, r_trip.text[:200])
    if r_trip.status_code == 201:
        tid = r_trip.json()['id']
        check('immich trip album 404 when unlinked', adv.get(f'/api/immich/trips/{tid}/album').status_code == 404)
        check('immich invalid album id 422',
              adv.patch(f'/api/trips/{tid}', json={'immich_album_id': 'bad/id!'}).status_code == 422)
        r_link = adv.patch(f'/api/trips/{tid}', json={'immich_album_id': '11111111-2222-3333-4444-555555555555'})
        check('immich album id saved',
              r_link.status_code == 200 and r_link.json().get('immich_album_id') == '11111111-2222-3333-4444-555555555555')
        if not immich_enabled:
            check('immich trip album 503 when disabled', adv.get(f'/api/immich/trips/{tid}/album').status_code == 503)
        r_clear = adv.patch(f'/api/trips/{tid}', json={'clear_immich_album': True})
        check('immich album id cleared',
              r_clear.status_code == 200 and r_clear.json().get('immich_album_id') is None)

        # Mocked upstream Immich responses: verify album listing dedup/sorting,
        # external_links fallback, video filtering, and strict image MIME check.
        import httpx as _httpx
        from app.config import settings as _settings
        from app.services import immich_service as _immich_svc

        def _mock_immich_handler(request: _httpx.Request) -> _httpx.Response:
            path = request.url.path
            if path == '/api/albums' and request.url.params.get('shared') == 'true':
                return _httpx.Response(200, json=[
                    {'id': 'alb-1', 'albumName': 'Porto', 'assetCount': 2, 'startDate': '2026-04-01T00:00:00Z'},
                    {'id': 'alb-2', 'albumName': 'Açores', 'assetCount': 5, 'startDate': None},
                ])
            if path == '/api/albums':
                return _httpx.Response(200, json=[
                    {'id': 'alb-1', 'albumName': 'Porto', 'assetCount': 2, 'startDate': '2026-04-01T00:00:00Z'},
                ])
            if path == '/api/albums/alb-1':
                return _httpx.Response(200, json={
                    'id': 'alb-1',
                    'albumName': 'Porto',
                    'assets': [
                        {
                            'id': 'img-1',
                            'type': 'IMAGE',
                            'originalFileName': 'ponte.jpg',
                            'exifInfo': {'description': 'Ponte Luís I', 'latitude': 41.14, 'longitude': -8.61},
                        },
                        {'id': 'vid-1', 'type': 'VIDEO', 'originalFileName': 'clip.mp4'},
                    ],
                })
            if path == '/api/albums/alb-2':
                # Immich v3+: GET /api/albums/{id} omits `assets`, requiring POST /api/search/metadata.
                return _httpx.Response(200, json={
                    'id': 'alb-2',
                    'albumName': 'Açores',
                    'assetCount': 2,
                    'order': 'asc',
                })
            if path == '/api/search/metadata' and request.method == 'POST':
                import json as _json
                req_body = _json.loads(request.content.decode())
                page = req_body.get('page', 1)
                if page == 1:
                    return _httpx.Response(200, json={
                        'assets': {
                            'items': [{'id': 'img-v3-1', 'type': 'IMAGE', 'originalFileName': 'lagoa.jpg'}],
                            'nextPage': '2',
                        }
                    })
                return _httpx.Response(200, json={
                    'assets': {
                        'items': [{'id': 'img-v3-2', 'type': 'IMAGE', 'originalFileName': 'mar.jpg'}],
                        'nextPage': None,
                    }
                })
            if path == '/api/assets/img-1/thumbnail':
                return _httpx.Response(200, content=b'\xff\xd8\xff\xe0jpeg', headers={'content-type': 'image/jpeg'})
            if path == '/api/assets/bad-mime/thumbnail':
                return _httpx.Response(200, content=b'<html>oops</html>', headers={'content-type': 'text/html'})
            if path == '/api/assets/svg-mime/thumbnail':
                return _httpx.Response(200, content=b'<svg></svg>', headers={'content-type': 'image/svg+xml'})
            return _httpx.Response(404)

        orig_url, orig_key, orig_pub, orig_client = (
            _settings.immich_url, _settings.immich_api_key, _settings.immich_public_url, _immich_svc._client
        )
        try:
            _settings.immich_url = 'http://immich.test:2283'
            _settings.immich_api_key = 'test-key'
            _settings.immich_public_url = ''
            _immich_svc._client = _httpx.AsyncClient(transport=_httpx.MockTransport(_mock_immich_handler))

            r_list = adv.get('/api/immich/albums')
            check('immich albums deduped and sorted',
                  r_list.status_code == 200 and [a['id'] for a in r_list.json()] == ['alb-1', 'alb-2'],
                  r_list.text[:200])

            # Fallback from external_links preserves the pasted album URL.
            adv.patch(f'/api/trips/{tid}', json={'external_links': [{'url': 'https://fotos.immich.example/albums/alb-1'}]})
            r_alb = adv.get(f'/api/immich/trips/{tid}/album')
            alb_body = r_alb.json() if r_alb.status_code == 200 else {}
            check('immich album fallback + video filtered + exif mapped',
                  r_alb.status_code == 200
                  and alb_body.get('asset_count') == 1
                  and alb_body.get('external_url') == 'https://fotos.immich.example/albums/alb-1'
                  and alb_body['assets'][0]['caption'] == 'Ponte Luís I'
                  and alb_body['assets'][0]['lat'] == 41.14,
                  r_alb.text[:200])

            # Immich v3+ album (no inline `assets`, paginated via POST /api/search/metadata).
            adv.patch(f'/api/trips/{tid}', json={'immich_album_id': 'alb-2'})
            r_alb_v3 = adv.get(f'/api/immich/trips/{tid}/album')
            v3_body = r_alb_v3.json() if r_alb_v3.status_code == 200 else {}
            check('immich v3 album fetched via search/metadata pagination',
                  r_alb_v3.status_code == 200
                  and v3_body.get('asset_count') == 2
                  and [a['id'] for a in v3_body.get('assets', [])] == ['img-v3-1', 'img-v3-2'],
                  r_alb_v3.text[:200])

            r_thumb = adv.get('/api/immich/assets/img-1/thumbnail?size=preview')
            check('immich thumbnail proxy serves image/jpeg private',
                  r_thumb.status_code == 200
                  and r_thumb.headers.get('content-type', '').startswith('image/jpeg')
                  and 'private' in r_thumb.headers.get('cache-control', ''))
            check('immich thumbnail rejects text/html 502',
                  adv.get('/api/immich/assets/bad-mime/thumbnail').status_code == 502)
            check('immich thumbnail rejects svg 502',
                  adv.get('/api/immich/assets/svg-mime/thumbnail').status_code == 502)
        finally:
            _settings.immich_url = orig_url
            _settings.immich_api_key = orig_key
            _settings.immich_public_url = orig_pub
            _immich_svc._client = orig_client

        adv.delete(f'/api/trips/{tid}')

    # Bulk import resilience & 500-line cap (mocked Nominatim)
    from app.services import place_service as _place_svc
    import httpx as _httpx2

    r_bulk_proj = adv.post('/api/projects/', json={'name': 'Bulk 500 Smoke', 'visibility': 'all', 'map_mode': 'auto'})
    check('bulk 500 test project created', r_bulk_proj.status_code == 201, r_bulk_proj.text[:200])
    if r_bulk_proj.status_code == 201:
        bpid = r_bulk_proj.json()['id']
        # 501 lines rejected with 422; 500 cached/deduped lines accepted quickly
        r_over = adv.post(f'/api/projects/{bpid}/bulk-import', json={'lines': ['Santiago de Compostela'] * 501})
        check('bulk import >500 rejected 422', r_over.status_code == 422, r_over.text[:200])
        r_500 = adv.post(f'/api/projects/{bpid}/bulk-import', json={'lines': ['Santiago de Compostela'] * 500})
        check('bulk import 500 lines accepted',
              r_500.status_code == 200 and len(r_500.json().get('lines', [])) == 500,
              r_500.text[:200])

        # Mock Nominatim to test: (1) 429 retry recovery, (2) 503 surfaced on
        # persistent upstream failure for uncached lines, (3) batched /lookup polygons.
        search_calls: dict[str, int] = {}
        lookup_batches: list[str] = []

        def _mock_nominatim(request: _httpx2.Request) -> _httpx2.Response:
            if request.url.path == '/search':
                q = request.url.params.get('q', '')
                search_calls[q] = search_calls.get(q, 0) + 1
                if q == 'RetryTown' and search_calls[q] == 1:
                    return _httpx2.Response(429, headers={'Retry-After': '0'})
                if q == 'RetryTown':
                    return _httpx2.Response(200, json=[{
                        'osm_type': 'relation',
                        'osm_id': 990001,
                        'display_name': 'RetryTown, Galiza, Espanha',
                        'class': 'boundary',
                        'type': 'administrative',
                        'extratags': {'admin_level': '8'},
                        'address': {'country': 'Espanha', 'state': 'Galiza'},
                        'lat': '42.50',
                        'lon': '-8.10',
                    }])
                if q == 'RetryTown2':
                    return _httpx2.Response(200, json=[{
                        'osm_type': 'relation',
                        'osm_id': 990002,
                        'display_name': 'RetryTown2, Galiza, Espanha',
                        'class': 'boundary',
                        'type': 'administrative',
                        'extratags': {'admin_level': '8'},
                        'address': {'country': 'Espanha', 'state': 'Galiza'},
                        'lat': '42.60',
                        'lon': '-8.20',
                    }])
                if q == 'AlwaysDown':
                    return _httpx2.Response(503)
                return _httpx2.Response(200, json=[])
            if request.url.path == '/lookup':
                osm_ids_param = request.url.params.get('osm_ids', '')
                lookup_batches.append(osm_ids_param)
                poly = {
                    'type': 'Polygon',
                    'coordinates': [[[-8.1, 42.5], [-8.0, 42.5], [-8.0, 42.6], [-8.1, 42.6], [-8.1, 42.5]]],
                }
                return _httpx2.Response(200, json=[
                    {'osm_type': 'relation', 'osm_id': 990001, 'geojson': poly},
                    {'osm_type': 'relation', 'osm_id': 990002, 'geojson': poly},
                ])
            return _httpx2.Response(404)

        orig_nom_client, orig_nom_loop, orig_interval, orig_base_delay = (
            _place_svc._client,
            _place_svc._client_loop,
            _place_svc._NOMINATIM_MIN_INTERVAL,
            _place_svc._NOMINATIM_RETRY_BASE_DELAY,
        )
        try:
            _place_svc._client = _httpx2.AsyncClient(transport=_httpx2.MockTransport(_mock_nominatim))
            _place_svc._client_loop = None
            _place_svc._NOMINATIM_MIN_INTERVAL = 0.0
            _place_svc._NOMINATIM_RETRY_BASE_DELAY = 0.01

            # Duplicate lines in payload only hit Nominatim once; 429 recovers on retry
            r_res = adv.post(f'/api/projects/{bpid}/bulk-import', json={
                'lines': ['RetryTown', 'retrytown', 'RetryTown2']
            })
            check('bulk import retries 429 and deduplicates lines',
                  r_res.status_code == 200
                  and len(r_res.json()['lines']) == 3
                  and all(l['status'] == 'resolved' for l in r_res.json()['lines'])
                  and search_calls.get('RetryTown') == 2
                  and search_calls.get('retrytown', 0) == 0,
                  r_res.text[:200])

            # Persistent Nominatim 503 on uncached query returns 503 instead of false not_found
            r_down = adv.post(f'/api/projects/{bpid}/bulk-import', json={'lines': ['AlwaysDown']})
            check('bulk import surfaces 503 on persistent upstream failure',
                  r_down.status_code == 503,
                  r_down.text[:200])

            # Confirm batches multiple missing polygons into a single /lookup request
            resolved_pair = [r_res.json()['lines'][0], r_res.json()['lines'][2]]
            act_before = len(adv.get('/api/activities/').json())
            r_conf = adv.post(f'/api/projects/{bpid}/bulk-import/confirm?log_activity=false', json=resolved_pair)
            act_after = len(adv.get('/api/activities/').json())
            check('bulk confirm batches polygon lookup and respects log_activity=false',
                  r_conf.status_code == 200
                  and len(r_conf.json()['places']) == 2
                  and all(p['place_polygon'] is not None for p in r_conf.json()['places'])
                  and lookup_batches == ['R990001,R990002']
                  and act_after == act_before,
                  r_conf.text[:200])
        finally:
            _place_svc._client = orig_nom_client
            _place_svc._client_loop = orig_nom_loop
            _place_svc._NOMINATIM_MIN_INTERVAL = orig_interval
            _place_svc._NOMINATIM_RETRY_BASE_DELAY = orig_base_delay
            adv.delete(f'/api/projects/{bpid}')
            db = SessionLocal()
            try:
                db.query(Place).filter(Place.osm_id.in_([990001, 990002])).delete(synchronize_session=False)
                db.commit()
            finally:
                db.close()

    # Final summary
    passed = sum(1 for _, s, _ in results if s == 'PASS')
    failed = sum(1 for _, s, _ in results if s == 'FAIL')
    print(f'\n=== SUMMARY: PASS={passed}, FAIL={failed} ===')
    for name, status, detail in results:
        if status == 'FAIL':
            print(f'  FAIL: {name} — {detail}')
    return failed == 0


if __name__ == '__main__':
    import sys
    sys.exit(0 if main() else 1)
