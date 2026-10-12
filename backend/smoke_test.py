#!/usr/bin/env python3
"""Functional smoke test for Percursos (Phase 5.1a)."""

from datetime import date
from io import BytesIO
from PIL import Image
from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal
from app.models import User, Place, Project, Trip, TripPlace, TripProject, ProjectPlace, Milestone, Activity, PlaceType
from app.auth import hash_password


def make_image():
    img = Image.new('RGB', (100, 100), color='red')
    buf = BytesIO()
    img.save(buf, format='PNG')
    buf.seek(0)
    return buf


def login(client, username, password):
    r = client.post('/api/auth/login', json={'username': username, 'password': password})
    assert r.status_code == 200, f'login failed: {r.text}'
    token = r.cookies.get('session')
    client.headers.update({'x-csrf-token': token})
    return r.json()['user']


def create_user(db, username, password):
    u = User(username=username, password_hash=hash_password(password), role='user', is_active=True)
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def reset_test_data(db):
    for username in ['smoke_user1', 'smoke_user2']:
        u = db.query(User).filter(User.username == username).first()
        if u:
            db.query(Activity).filter(Activity.user_id == u.id).delete()
            db.query(Milestone).filter(Milestone.user_id == u.id).delete()
            db.query(TripProject).filter(TripProject.trip_id.in_([t.id for t in u.trips])).delete()
            db.query(TripPlace).filter(TripPlace.trip_id.in_([t.id for t in u.trips])).delete()
            db.query(Trip).filter(Trip.creator_id == u.id).delete()
            db.query(ProjectPlace).filter(ProjectPlace.project_id.in_([p.id for p in u.projects])).delete()
            db.query(Project).filter(Project.creator_id == u.id).delete()
            db.delete(u)
    for name in ['Santiago de Compostela', 'Lugo', 'Lugo Sur', 'A Coruña']:
        db.query(Place).filter(Place.name == name).delete()
    db.commit()


def main():
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

    # Manual unmark a place in project
    place_to_unmark = place_ids_in_project[0]
    r = client1.post(f'/api/projects/{project_id}/places/{place_to_unmark}/unmark')
    check('manual unmark', r.status_code == 200)
    r = client1.get(f'/api/projects/{project_id}')
    check('progress after unmark', r.json()['visited_places'] == 1 and not r.json()['is_completed'])

    # Re-mark
    r = client1.post(f'/api/projects/{project_id}/places/{place_to_unmark}/unmark')
    check('re-mark', r.status_code == 200)
    r = client1.get(f'/api/projects/{project_id}')
    check('progress after re-mark', r.json()['visited_places'] == 2 and r.json()['is_completed'])

    # Preferences
    r = client1.patch('/api/me/', json={'timezone': 'Europe/Madrid', 'date_format': '%Y-%m-%d', 'theme': 'dark'})
    check('update preferences', r.status_code == 200)
    check('preferences persisted', r.json()['timezone'] == 'Europe/Madrid' and r.json()['date_format'] == '%Y-%m-%d' and r.json()['theme'] == 'dark')

    # Avatar
    img = make_image()
    r = client1.post('/api/me/avatar', files={'file': ('avatar.png', img, 'image/png')})
    check('upload avatar', r.status_code == 200)
    check('avatar url', r.json()['avatar_url'].startswith('/uploads/'))

    # Password change
    r = client1.post('/api/me/password', json={'current_password': 'pass12345', 'new_password': 'newpass123'})
    check('change password', r.status_code == 200)

    client3 = TestClient(app)
    r = client3.post('/api/auth/login', json={'username': 'smoke_user1', 'password': 'newpass123'})
    check('login with new password', r.status_code == 200)

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
