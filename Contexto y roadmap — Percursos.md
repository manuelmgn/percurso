# Percursos — Documento de contexto y continuación (handoff)

> Este documento es la fuente de verdad del proyecto. Antes de escribir código, léelo entero y analiza el código existente para comprobar qué está implementado y cómo. Si el código contradice este documento, este documento manda (salvo que el usuario diga lo contrario). Trabaja de forma **incremental**: modifica solo lo necesario, no regeneres archivos enteros, y verifica siempre antes de dar nada por terminado.

---

## 1. Qué es Percursos

Aplicación web **privada** para registrar, organizar y consultar viajes y lugares visitados. Usuarios: inicialmente 2 (el desarrollador y su pareja), ampliable. Proyecto motivador: "Vilas do País" (visitar los +300 concellos de Galicia), pero la app es genérica.

**Principios rectores, en este orden:**
1. **Ligereza y velocidad** ante todo: bundle mínimo, cero llamadas innecesarias, nada pesado.
2. **Claridad**: UI directa y fácil.
3. **Atractivo visual**, nunca a costa del rendimiento.

**Restricciones absolutas:**
- **CERO Google**: ni Google Fonts, ni Maps, ni Analytics, ni CDN de Google, ni nada de Google. Todas las fuentes y recursos se sirven localmente. Únicos servicios externos permitidos: APIs de OpenStreetMap (Nominatim/Overpass) y tiles de OSM.
- **UI 100 % en portugués europeo (pt-PT)**, sin galleguismos ni brasileñismos. Ej.: "Cria o teu primeiro percurso", "Só amizades".
- **Código, comentarios y documentación técnica en inglés UK.**
- **Sin tests** (decisión del usuario): prioridad a la ligereza.

## 2. Stack (decidido, no cambiar sin consultar)

- **Backend**: FastAPI (Python). El desarrollador domina Python.
- **BD**: SQLite con WAL. (Futuro lejano: migración a PostgreSQL — mantener la capa de datos limpia para no bloquearla, pero NO hacerla.)
- **Frontend**: SPA ligera Vite + React, servida como estáticos por el backend. Code-splitting por ruta.
- **Auth**: sesiones con cookie httpOnly (30 días, renovación automática). Registro cerrado: solo el admin crea usuarios. Primer arranque: asistente que crea el admin (+ opcional segundo usuario).
- **Mapas**: Leaflet + tiles OSM con caché local (backend como proxy/caché). Leaflet se carga solo cuando hay mapa visible.
- **Imágenes**: almacenamiento local; al subir se redimensionan (máx. ~2000 px) y se convierten a **WebP**; HEIC (iPhone) se convierte automáticamente. Avatares: mismo pipeline.
- **Despliegue**: Docker Compose (servicio `app` + servicio `backup`). HTTP (red local + VPN; sin HTTPS).
- **Backups**: automático semanal a carpeta local (retención 1 mes) + botón manual en el panel de admin. La restauración debe funcionar, no solo la copia.
- **Fuentes auto-alojadas**: Sora (wordmark "Percursos" y títulos principales) + sans elegante de cuerpo (Inter o similar), woff2 con `font-display: swap`.
- **i18n**: sistema de mensajes desde el inicio; pt-PT como único idioma actual.

## 3. Modelo de datos y reglas de negocio

**Entidades**: Usuario, Proyecto, Viaje, Lugar, Actividad.

**Proyecto**: nombre, descripción, lista de lugares objetivo (opcional y editable siempre; cualquier participante puede modificarla), visibilidad, participantes, `map_mode` (`points`/`polygons`). Si tiene lista → completable (muestra % y puede completarse); si no → abierto (acumula viajes). Sin taxonomía de tipos de proyecto.

**Viaje**: fechas inicio/fin (fin obligatoria; si se omite = inicio; editable), lugares (1+; **único por viaje**, revisitas se anotan en notas; no importa el día exacto de cada lugar), compañía (usuarios de la app + texto libre para externos), proyectos asociados (0..N), **un único bloc de notas WYSIWYG** (negritas, listas, links, imágenes embebidas en el texto; HTML saneado en servidor), imágenes del viaje en general, visibilidad, participantes.

**Lugar**: solo desde OSM (sin texto libre, sin creación manual). Tabla local permanente (caché que no caduca): id OSM, nombre, tipo (taxonomía propia), jerarquía administrativa, punto (lat/lon), polígono simplificado si existe. Unicidad: un mismo lugar real existe una sola vez (una única "cidade de Lugo, provincia de Lugo, Galicia, España"). Homónimos distintos (ciudad vs. provincia de Lugo) son entradas distintas y se diferencian en la UI con `Nombre — jerarquía [Tipo]`.

**Taxonomía de tipos de lugar** (etiquetas pt-PT, mapeo automático desde etiquetas OSM): `edifício/monumento`, `rua/praça`, `aldeia/lugar`, `freguesia`, `vila/cidade`, `concelho/município`, `comarca`, `província`, `região/comunidade`, `país`, `continente`, `outro`. Mapeo: `admin_level` 2→país, 4→região, 6→província, 8→concelho, 9→freguesia; `place=city|town`→vila/cidade; `place=village|hamlet`→aldeia/lugar; `tourism/historic/building`→edifício/monumento. Si el mapeo es dudoso, el usuario elige en la pantalla de revisión.

**Actividad**: feed global con las últimas ~50 acciones (crear/editar/borrar viajes y proyectos), respetando visibilidad.

## 4. Reglas clave de comportamiento

- **Progreso**: un lugar-objetivo cuenta como visitado si existe ≥1 viaje visible para el usuario que lo incluye y está asociado al proyecto. % visible en todas las tarjetas/grids de proyectos. Desmarque manual posible desde ficha de lugar o proyecto.
- **Borrar viaje con proyectos asociados**: aviso previo listando proyectos afectados + recálculo.
- **Permisos**: cualquier participante de un viaje/proyecto compartido puede editarlo y borrarlo.
- **Visibilidad** (por elemento): Todos / usuarios concretos / Privado (privado: solo participantes; si no hay, solo el creador). Por defecto "Todos". Lo no visible no aparece en listados, mapas, buscador, feed ni estadísticas. ⚠️ Esto cambiará en la Fase 8 (ver §7).
- **Carga en bulk**: textarea con un lugar por línea → resolución contra caché + Nominatim/Overpass (User-Agent propio, máx. 1 req/s) → **pantalla de revisión** (inequívocos resueltos; ambiguos con candidatos a elegir; no encontrados señalados, no importados) → confirmación.
- **Mapas**:
  - Dashboard: puntos **deduplicados** de los lugares visitados **por el usuario que mira**; estilo minimalista.
  - Proyecto: colores por estado (visitado/pendiente), tanto en puntos como en polígonos; toggle puntos/polígonos **solo si todos los lugares son del mismo tipo** (si mezcla tipos → siempre puntos); el `map_mode` lo fija quien crea/edita y todos lo ven igual; lugar sin polígono → punto aunque el modo sea polygons; clic → popup (nombre, estado, enlace a ficha).
  - Viaje: todos los puntos de un solo color.
  - Ficha de lugar: mini-mapa (punto o polígono), estilo detallado.
  - Viewport auto-ajustado a los lugares mostrados.
- **Dashboard**: mapa personal + máx. 2 proyectos y 2 viajes pineados (chincheta al hover) + no pineados por fecha de edición/creación (más recientes primero) + mini-resumen de estadísticas + feed de actividad + botón crear viaje.
- **Estadísticas**: página propia "Estatísticas" (contadores, % por proyecto, lugares por provincia, ranking de lugares más visitados) + resumen en dashboard. Gráficos ligeros (SVG/CSS propio).
- **Gamificación**: confeti ligero (JS propio) + badge al completar proyecto; hitos al 25/50/75 %; números redondos (lugar nº 50, 100, 200…); primer viaje y primer lugar de un proyecto. Cada hito se celebra una sola vez (persistir).
- **Buscador global** en la barra: viajes + lugares + proyectos, resultados agrupados por tipo, respetando visibilidad.
- **Listados**: búsqueda por texto, ordenación (fecha del viaje / edición / alfabético); preferencias recordadas por usuario entre sesiones.
- **Preferencias de usuario**: zona horaria y formato de fecha (defecto dd/mm/aaaa), tema claro/oscuro/sistema (persistente), avatar, cambio de contraseña.
- **Admin**: crear usuarios con contraseña inicial, resetear contraseñas, desactivar/borrar usuarios, cambiar nombre/avatar de cualquiera, backup manual.
- **Estados vacíos**: ilustraciones/mensajes simpáticos con CTA en pt-PT.
- **Estilo visual**: moderno tipo dashboard inspirado en Liquid Glass de Apple (transparencias, backdrop-blur con moderación, tarjetas flotantes, radios generosos, sombras suaves, micro-animaciones 150–250 ms). Sidebar en desktop → hamburguesa/bottom-bar en móvil. Formularios con estética tipo Notion. Uso equilibrado móvil/desktop.

## 5. Estado actual del proyecto

- **Fases 1–5: COMPLETADAS** (esqueleto+auth+viajes; proyectos+bulk; mapas; notas/imágenes/actividad/estadísticas/gamificación; identidad visual+backups+preferencias).
- **Fase 5.1 (auditoría pre-beta): EN CURSO** — auditoría funcional contra especificación, prueba de humo con 2 usuarios, instalación desde cero, restauración real de backups, endurecimiento básico, revisión de textos pt-PT, informe final.
- La sección **Lugares** ya debe existir como listado: lugares relevantes para el usuario (visitados en viajes visibles u objetivos de proyectos visibles), con nombre, tipo, jerarquía, estado (visitado con nº de visitas / pendiente), búsqueda, filtros (tipo, estado), ordenación persistente y enlace a la ficha. No se crean lugares manualmente.

## 6. Cómo trabajar (acuerdos con el usuario)

1. Funcional antes que bonito; nada de datos mock ni botones decorativos.
2. Trabajo **por fases verificables**: al terminar cada fase, ejecuta y prueba tú mismo los flujos (con Docker Compose), corrige, y reporta qué probaste + cómo probarlo paso a paso.
3. Cambios incrementales; no regeneres archivos enteros sin necesidad.
4. Respeta la política de uso de Nominatim/Overpass (User-Agent identificativo, 1 req/s, caché agresivo).
5. No releas documentación completa si solo necesitas una sección (ahorro de contexto).

## 7. Roadmap — futuras fases (no implementar hasta que el usuario lo pida)

**Fase 6 — Perfiles públicos estilo Twitter/X**
- Vista pública de perfil: nombre público, `@usuario` en gris, descripción (opcional), link (opcional), stats (viajes / lugares visitados) en dos columnas, y mapa de lugares visitados **filtrado por la visibilidad de quien mira** (un visitante solo ve los lugares de viajes que puede ver).
- Avatar y "Perfil" del menú llevan al mismo destino: la vista pública del perfil.
- "Editar perfil" separado de "Ajustes": nombre público, foto, descripción, link.

**Fase 7 — Amistades + Notificaciones**
- Amistad **bidireccional con aceptación**: A solicita a B; si B acepta, ambos son amigos; si uno rompe, se rompe para ambos. NO es un sistema de seguimiento.
- Nueva sección **Notificações**: solicitudes de amistad + avisos cuando alguien crea/edita/borra un viaje o proyecto compartido contigo o al que perteneces.
- Desktop: página propia en el sidebar; si hay no leídas, **puntito parpadeante** (punto en color principal con halo transparente parpadeante). Historial completo, más nuevas arriba, opción de limpiar.
- Móvil: las notificaciones viven en Inicio; cuadro propio con las no leídas; puntito sobre el icono de inicio (esquina superior derecha); si no hay nuevas, el bloque de saludo muestra "Ver notificações" (en lugar de "Ver estatísticas", que desaparece) y lleva al historial con opción de limpiar.

**Fase 8 — Visibilidad "Só amizades" + Ajustes**
- La opción de visibilidad "Utilizadores específicos" se **sustituye** por **"Só amizades"**. Quedan 3 opciones: **Todos** (todos los usuarios registrados) / **Só amizades** / **Privado** (solo el propio usuario). Quien comparte un viaje/proyecto siempre puede verlo.
- Esto afecta a la lógica de visibilidad en TODA la app: listados, mapas (incluido el del perfil público), buscador, feed y estadísticas.
- Ajustes: cambio de nombre de usuario; cambio de contraseña mediante botón que abre ventana aparte (pide contraseña actual + nueva ×2); cambio de email. Todo en una misma caja.
- Caja "Preferências": mantener el selector de Tema tal cual; añadir (con título del mismo tamaño que "Tema") la **visibilidad por defecto** al crear viajes y, por separado, al crear proyectos.

**Fase 9 — Borradores**
- Viajes y proyectos pueden guardarse como **borrador** durante su creación.
- Botonera: "Publicar" + "Guardar borrador"; si ya estamos en un borrador: "Publicar" + "Descartar borrador".
- Al publicar, el borrador se borra. Borradores sin editar en **60 días**: borrado automático.
- En los listados de viajes/proyectos, los borradores aparecen mezclados siguiendo el mismo orden, con etiqueta **"Rascunho"** y toda la tarjeta con un ligero sombreado diferenciador.

**Fase 10 — Pulido de formularios**
- Formularios de creación de viaje/proyecto deben **usar el ancho disponible** (manteniendo márgenes y padding); ahora quedan estrechos.
- Al marcar acompañantes en un viaje, solo se pueden elegir usuarios que sean **amigos** (depende de la Fase 7).

**Largo plazo**
- Migración SQLite → PostgreSQL (solo cuando el usuario lo decida).
- Posible auto-alojamiento de tiles de mapa si el uso crece.

---

*Documento vivo: el usuario irá añadiendo correcciones y nuevas fases; las fases futuras son provisionales y pueden reorganizarse.*
