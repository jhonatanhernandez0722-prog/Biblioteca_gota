# Biblioteca Gota Gota · Dirección de diseño

Documento de trabajo previo a la implementación. Resume las decisiones que guían el código; los valores exactos viven en `src/app/globals.css` (tokens) y en los componentes.

## 1. La idea

> En esta web, **la gota** —la unidad mínima del agua y de la tinta— se convierte en **la unidad de lectura**: cada libro es una gota que cae, y sus ondas son lo que la lectura mueve en las personas y en la comunidad.

Tres materiales del propio nombre de la marca sostienen todo el sistema:

| Material | Color | Papel en la interfaz |
|---|---|---|
| Tinta | Azul tinta `#16324F` | Estructura: navegación, títulos, texto, pie, barra del panel |
| Papel | Marfil `#FAF8F2` | Calidez: el fondo de lectura |
| Agua | Turquesa `#56B8B0` | Reconocimiento: la gota, las ondas, los momentos de marca |

### La firma visual

- **Símbolo**: una gota partida por el lomo. La mitad izquierda es tinta y la derecha es agua; la ranura central es el lomo de un libro que se abre. Funciona a 16 px (favicon) y a 600 px (escenario del hero).
- **Ondas**: elipses concéntricas en turquesa que nacen bajo las portadas del hero, como si los libros acabaran de caer al agua. Se usan en tres lugares como máximo: hero, acceso (login) y estados vacíos.
- **Lo que se puede hacer («gota a gota»)**: una calculadora de ritmo de lectura. Eliges cuántas páginas lees al día y ves, en gotas, cuántos días tardarías en terminar un libro concreto y si te alcanza el plazo de préstamo (21 días, renovable dos veces). Usa datos reales: páginas del libro y reglas de préstamo del sistema.

### La prueba del competidor

«Otra biblioteca» no puede usar la gota partida, ni las ondas, ni el «gota a gota» del ritmo de lectura: los tres salen del nombre. Los artefactos del mundo bibliotecario (la **ficha catalográfica** en el detalle, la **ficha de préstamo** con fecha de devolución y el **índice** de categorías con puntos guía) son silenciosos y tipográficos; no compiten con la firma.

## 2. Tokens

### Color (roles)

| Token | Valor | Uso |
|---|---|---|
| `--ink` | `#16324F` | Texto principal, títulos, campos de tinta |
| `--ink-2` | `#244A68` | Botón primario, estados activos, hover de enlaces |
| `--water` | `#56B8B0` | Gotas, ondas, acentos gráficos y texto sobre tinta (5,5:1) |
| `--water-deep` | `#287F7A` | Acentos con contraste, botón de marca, indicadores |
| `--water-ink` | `#236F6A` | Texto turquesa pequeño sobre marfil (5,6:1). Derivado de `--water-deep` para cumplir AA |
| `--paper` | `#FAF8F2` | Fondo general |
| `--surface` | `#FFFFFF` | Formularios, tablas, paneles de lectura |
| `--paper-deep` | `#F2EEE3` | Escalón tonal para separar secciones sin líneas |
| `--water-tint` | `#E4F3F1` | Campo suave de marca |
| `--muted` | `#5B6B80` | Texto secundario (5,1:1 sobre marfil). Derivado de `#64748B`, que en marfil queda en 4,48:1 |
| `--line` | `#E2E8F0` | Divisores discretos |
| `--line-strong` | `#7C8A9C` | Borde de campos de formulario (3,3:1, WCAG 1.4.11) |
| `--success` | `#247A52` | Disponible, confirmaciones |
| `--warning` / `--warning-ink` | `#A96516` / `#965913` | Vencimientos (el segundo, para texto pequeño) |
| `--danger` | `#B93838` | Errores y acciones destructivas |

Proporción: marfil ≈ 70 %, tinta ≈ 20 % (texto + campos de tinta), agua ≤ 10 %. Ningún degradado decorativo. Las sombras solo existen en lo que flota (menús, diálogos, cajones) y en las portadas, que son objetos.

### Tipografía

- **DM Serif Display** para las obras y la voz editorial: titulares, títulos de libros y citas. Regla: *las obras se escriben en serif; la interfaz, en Manrope*.
- **Manrope** (variable 200–800) para navegación, botones, formularios, metadatos y tablas.
- Archivos alojados en el propio proyecto (`src/fonts/`), sin depender de Google Fonts en tiempo de ejecución. Respaldo: `Georgia, 'Times New Roman', serif` y `system-ui, 'Segoe UI', Roboto, sans-serif`, con métricas ajustadas por `next/font`.

| Rol | Escritorio | Móvil | Fuente |
|---|---|---|---|
| Titular de portada | 64 px / 1,02 | 40 px | DM Serif Display |
| Título de página | 48 px / 1,05 | 34 px | DM Serif Display |
| Título de sección | 36 px / 1,1 | 28 px | DM Serif Display |
| Subtítulo | 22 px / 1,3 | 20 px | Manrope 700 |
| Título de tarjeta (obra) | 19 px / 1,25 | 17 px | DM Serif Display |
| Texto | 16 px / 1,6 | 16 px | Manrope 450 |
| Metadatos y etiquetas | 13–14 px / 1,45 | 13 px | Manrope 600 |

Sin versalitas espaciadas ni etiquetas sobre los títulos. El antetítulo del hero, que pide el brief, se compone en cursiva serif a tamaño legible y en minúsculas de frase.

### Espacio y forma

- Escala de 4 px: 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 80 · 96.
- Contenedor de 1240 px; márgenes de 48 px (escritorio), 24 px (tablet) y 16 px (móvil).
- Separación entre secciones: 96 px en escritorio y 64 px en móvil. Dentro de una sección, 32–48 px.
- Radios: 12 px para controles y tarjetas, 20 px para paneles destacados, píldora solo para estados y 3 px para las portadas (un libro casi no tiene curva).

### Movimiento

Un único momento orquestado: al cargar la portada, cae la gota, se abren las ondas y suben las portadas (con un escalonado de 80 ms). Todo lo demás es respuesta a una acción del usuario (pulsar, abrir, guardar, buscar) y dura entre 120 y 320 ms. Con `prefers-reduced-motion`, la escena aparece ya en reposo.

## 3. Estructura

### Portada (`/`)

```
[gota] Biblioteca Gota Gota   Inicio  Explorar libros  Categorías  Cómo funciona   Mi cuenta [Entrar]
──────────────────────────────────────────────────────────────────────────────────────
Un mundo de historias te espera            ·  (cae la gota)
Cada libro, una nueva                     ┌──┐┌────┐┌──┐
forma de ver el mundo                     │  ││    ││  │   portadas reales del catálogo
Descubre nuevas historias…                └──┘│    │└──┘
[ Título, autor o tema           (Buscar) ]   ((( ondas )))
[Explorar biblioteca]  Cómo funciona       «Título» · autor · Disponible
Prueba con: Cortázar · poesía · 978…
──────────────────────────────────────────────────────────────────────────────────────
Selección de la biblioteca   gran portada + texto | lista de 3
Novedades                    carril horizontal con fecha de llegada
Más consultados              ranking real (solo si hay préstamos suficientes)
Explorar por categorías      índice tipográfico con puntos guía y recuento
Disponibles para préstamo    rejilla de portadas con disponibilidad
Gota a gota (campo de tinta) cita + recomendación + calculadora de ritmo
Cómo funciona                4 pasos reales del préstamo con sus plazos
Invitación                   crear cuenta / ir a mis préstamos
Pie (campo de tinta)         nombre a todo lo ancho, enlaces, contacto, políticas, créditos
```

Alineación: todo a la izquierda sobre una sola rejilla de 12 columnas. Ninguna sección comparte composición con la contigua.

### Catálogo (`/explorar`)
Filtros laterales en escritorio y panel deslizante en móvil. Búsqueda, orden y página viven en la URL, y el formulario funciona sin JavaScript (GET).

### Detalle (`/libros/[slug]`)
Portada grande y botón de compartir. Bloque de disponibilidad con la acción principal (solicitar, reservar o iniciar sesión). Descripción, **ficha catalográfica** (editorial, año, ISBN, páginas, idioma, signatura), condiciones de préstamo y calculadora «gota a gota». Para el personal, la tabla de ejemplares físicos.

### Cuenta (`/cuenta`)
Carné de lector y préstamos en curso presentados como **fichas de préstamo** con fecha de devolución. Además: solicitudes, reservas con su puesto en la cola e historial.

### Acceso (`/entrar`, `/registro`, `/recuperar`, `/restablecer`)
Dos campos: a la izquierda, un campo de tinta con la gota, tres portadas reales y las ondas; a la derecha, el formulario sobre marfil.

### Panel (`/admin`)
Pantalla de trabajo: barra lateral de tinta, área marfil con paneles blancos, tablas reales, filtros, menús contextuales, diálogos y avisos. Sin gráficos inventados: solo recuentos reales.

### Importar (`/admin/libros/importar`), al estilo TMDB
Buscador con modo (automático, ISBN, título o autor) y rejilla de resultados (portada, título, autor, año y si ya está en el catálogo). El cajón de detalle se abre sin salir del formulario, y «Usar estos datos» rellena la ficha editable. El aviso de duplicados aparece en vivo. Desde ahí se sube la portada y se guarda en nuestra base de datos.

## 4. Referentes revisados («presencia social»)

| Referente | Qué funciona | Cómo lo traducimos |
|---|---|---|
| TMDB | Buscador como protagonista; filas con conmutadores; el póster como unidad | Hero con buscador; carriles de portadas; importador con rejilla de resultados y cajón de detalle |
| Letterboxd | Pósteres en proporción fija; listas con pósteres superpuestos; contenido diseñado para compartirse | Portadas 2:3 siempre; abanico de portadas en hero y acceso; **tarjeta Open Graph diseñada para cada libro** y botón de compartir |
| StoryGraph y Literal | Ritmo, progreso y citas | Calculadora «gota a gota»; cita editorial en la sección de tinta |
| Bibliotecas nacionales premiadas (NLI, NLA) | Accesibilidad y diseño universal | Contraste AA calculado, foco visible, objetivos de 44 px y estados que no dependen solo del color |

## 5. Revisión contra lo genérico

| Riesgo | Decisión |
|---|---|
| Fondo crema + serif de alto contraste + acento terracota | El brief fija marfil y serif, pero el acento es agua y la estructura es tinta. El marfil es más claro (`#FAF8F2`) y hay campos reales de tinta (editorial, pie, acceso, panel) |
| Antetítulos en versalitas espaciadas | Solo el que pide el brief, en cursiva serif y minúsculas de frase. Ninguna sección lleva etiqueta encima del título |
| Tarjetas SaaS idénticas con sombra | Las portadas son la tarjeta: nada de cajas alrededor de cada libro. Las sombras se limitan a objetos y elementos flotantes |
| Numeración decorativa 01/02/03 | Solo en «Cómo funciona» (una secuencia real) y en «Más consultados» (un ranking real) |
| Cadenas «A · B · C» y flechas «→» | Metadatos en líneas con estructura; iconos solo cuando informan |
| Estadísticas de relleno | Ninguna. El panel cuenta datos reales y «Más consultados» se oculta si no hay datos |

## 6. Conflictos entre guías y cómo se resolvieron

Hay tres fuentes de criterio: el brief del proyecto, la skill `frontend-design` y la skill del usuario `Skill_frontend.md` (tasteskill v2). Cuando chocan, manda el brief.

- **Antetítulo**: tasteskill lo prohíbe; el brief lo pide. Se mantiene, compuesto como una frase legible, no como una etiqueta.
- **Radios**: tasteskill prefiere botones rectos o píldora; el brief pide 10–14 px. Se usan 12 px.
- **Separación entre secciones**: tasteskill propone 120–240 px; el brief, 64–96 px. Se usan 96 px.
- **Herramientas de tasteskill**: los scripts `draw.mjs`, `inspect.mjs` y `assets.mjs` no están instalados (solo el `.md`). Se aplican sus reglas a mano y su crítica se hace con capturas reales en Chrome a 1440, 768 y 390 px.
