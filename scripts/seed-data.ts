/**
 * Catálogo de demostración: títulos reales. Los metadatos (editorial, año, ISBN,
 * páginas) y las portadas se importan de Open Library al sembrar; las sinopsis son
 * resúmenes propios de la biblioteca. Ejemplares y préstamos son ficticios.
 */
export interface SeedBook {
  key: string
  title: string
  authors: string[]
  categories: string[]
  year: number
  pages?: number
  copies: number
  featured?: boolean
  synopsis: string
  keywords?: string
}

export const SEED_BOOKS: SeedBook[] = [
  {
    key: 'cien-anos',
    title: 'Cien años de soledad',
    authors: ['Gabriel García Márquez'],
    categories: ['Novela', 'Autores colombianos'],
    year: 1967,
    copies: 2,
    featured: true,
    keywords: 'realismo mágico, Macondo, familia Buendía',
    synopsis:
      'La historia de siete generaciones de la familia Buendía en Macondo, el pueblo que fundaron entre ciénagas y que crece, prospera y se desvanece con ellos. Una de las novelas fundamentales del realismo mágico.',
  },
  {
    key: 'rayuela',
    title: 'Rayuela',
    authors: ['Julio Cortázar'],
    categories: ['Novela'],
    year: 1963,
    copies: 2,
    featured: true,
    keywords: 'París, Buenos Aires, novela experimental',
    synopsis:
      'Horacio Oliveira busca sentido entre París y Buenos Aires, cerca y lejos de la Maga. Una novela que puede leerse en orden o saltando de capítulo en capítulo, siguiendo el tablero que propone el autor.',
  },
  {
    key: 'pedro-paramo',
    title: 'Pedro Páramo',
    authors: ['Juan Rulfo'],
    categories: ['Novela'],
    year: 1955,
    copies: 2,
    featured: true,
    keywords: 'Comala, México rural',
    synopsis:
      'Juan Preciado llega a Comala buscando a su padre y encuentra un pueblo habitado por murmullos y recuerdos. Una novela breve y fragmentaria que cambió la narrativa en español.',
  },
  {
    key: 'ficciones',
    title: 'Ficciones',
    authors: ['Jorge Luis Borges'],
    categories: ['Cuento'],
    year: 1944,
    copies: 2,
    featured: true,
    keywords: 'laberintos, biblioteca de Babel',
    synopsis:
      'Cuentos de bibliotecas infinitas, laberintos, sueños y enciclopedias de mundos inventados. Incluye «La biblioteca de Babel», «Pierre Menard, autor del Quijote» y «El jardín de senderos que se bifurcan».',
  },
  {
    key: 'casa-espiritus',
    title: 'La casa de los espíritus',
    authors: ['Isabel Allende'],
    categories: ['Novela'],
    year: 1982,
    copies: 1,
    keywords: 'saga familiar, Chile',
    synopsis:
      'La saga de la familia Trueba a lo largo de tres generaciones de mujeres, entre la clarividencia, el amor y la violencia política de un país latinoamericano del siglo XX.',
  },
  {
    key: 'amor-colera',
    title: 'El amor en los tiempos del cólera',
    authors: ['Gabriel García Márquez'],
    categories: ['Novela', 'Autores colombianos'],
    year: 1985,
    copies: 2,
    keywords: 'Caribe colombiano, amor, vejez',
    synopsis:
      'Florentino Ariza espera más de cincuenta años para volver a declarar su amor a Fermina Daza. Una novela sobre la paciencia, la vejez y las formas del amor en una ciudad del Caribe colombiano.',
  },
  {
    key: 'cronica',
    title: 'Crónica de una muerte anunciada',
    authors: ['Gabriel García Márquez'],
    categories: ['Novela', 'Autores colombianos'],
    year: 1981,
    copies: 3,
    synopsis:
      'Todo el pueblo sabe que los gemelos Vicario van a matar a Santiago Nasar, menos él. Una reconstrucción, casi periodística, de una muerte que nadie impidió.',
  },
  {
    key: 'quijote',
    title: 'Don Quijote de la Mancha',
    authors: ['Miguel de Cervantes'],
    categories: ['Clásicos', 'Novela'],
    year: 1605,
    pages: 1250,
    copies: 2,
    keywords: 'caballería, Sancho Panza, Siglo de Oro',
    synopsis:
      'Un hidalgo que ha leído demasiados libros de caballerías sale a los caminos de La Mancha con su escudero, Sancho Panza. La obra que inauguró la novela moderna.',
  },
  {
    key: 'veinte-poemas',
    title: 'Veinte poemas de amor y una canción desesperada',
    authors: ['Pablo Neruda'],
    categories: ['Poesía'],
    year: 1924,
    copies: 2,
    synopsis:
      'El libro de poemas de amor más leído en español, publicado por Neruda con apenas veinte años. Contiene el célebre «Puedo escribir los versos más tristes esta noche».',
  },
  {
    key: 'platero',
    title: 'Platero y yo',
    authors: ['Juan Ramón Jiménez'],
    categories: ['Clásicos', 'Infantil y juvenil'],
    year: 1914,
    copies: 1,
    synopsis:
      'Prosa poética sobre un pequeño burro y el pueblo andaluz de Moguer, contada con ternura y melancolía. Un clásico para leer a cualquier edad.',
  },
  {
    key: 'sombra-viento',
    title: 'La sombra del viento',
    authors: ['Carlos Ruiz Zafón'],
    categories: ['Novela'],
    year: 2001,
    copies: 2,
    featured: true,
    keywords: 'Barcelona, misterio, Cementerio de los Libros Olvidados',
    synopsis:
      'En la Barcelona de posguerra, Daniel descubre en el Cementerio de los Libros Olvidados una novela cuyo autor parece haber sido borrado. Misterio, amor y libros dentro de libros.',
  },
  {
    key: 'tunel',
    title: 'El túnel',
    authors: ['Ernesto Sabato'],
    categories: ['Novela'],
    year: 1948,
    copies: 1,
    synopsis:
      'Juan Pablo Castel, pintor, confiesa desde la cárcel cómo llegó a matar a María Iribarne, la única persona que pareció entender su obra. Una novela psicológica breve e intensa.',
  },
  {
    key: 'maria',
    title: 'María',
    authors: ['Jorge Isaacs'],
    categories: ['Clásicos', 'Autores colombianos'],
    year: 1867,
    copies: 2,
    featured: true,
    keywords: 'romanticismo, Valle del Cauca',
    synopsis:
      'Efraín regresa a la hacienda familiar en el Valle del Cauca y se enamora de su prima María. La gran novela romántica de la literatura colombiana.',
  },
  {
    key: 'voragine',
    title: 'La vorágine',
    authors: ['José Eustasio Rivera'],
    categories: ['Novela', 'Autores colombianos'],
    year: 1924,
    copies: 2,
    featured: true,
    keywords: 'selva, caucherías, Amazonía, Llanos',
    synopsis:
      'Arturo Cova huye a los Llanos y termina atrapado en la selva y en la explotación del caucho. Una novela que denunció la violencia de las caucherías en la Amazonía.',
  },
  {
    key: 'principito',
    title: 'El principito',
    authors: ['Antoine de Saint-Exupéry'],
    categories: ['Infantil y juvenil'],
    year: 1943,
    copies: 3,
    synopsis:
      'Un aviador perdido en el desierto conoce a un pequeño príncipe llegado de otro planeta. Una fábula sobre la amistad, el amor y lo esencial, que es invisible a los ojos.',
  },
  {
    key: '1984',
    title: '1984',
    authors: ['George Orwell'],
    categories: ['Ciencia ficción', 'Novela'],
    year: 1949,
    copies: 1,
    keywords: 'distopía, Gran Hermano, vigilancia',
    synopsis:
      'Winston Smith trabaja reescribiendo la historia para el Partido, bajo la vigilancia constante del Gran Hermano. La novela que dio nombre a la vigilancia totalitaria.',
  },
  {
    key: 'mundo-feliz',
    title: 'Un mundo feliz',
    authors: ['Aldous Huxley'],
    categories: ['Ciencia ficción'],
    year: 1932,
    copies: 2,
    keywords: 'distopía',
    synopsis:
      'Una sociedad futura donde las personas se fabrican en serie y la felicidad se garantiza con consumo y soma. Una distopía sobre el precio de la estabilidad.',
  },
  {
    key: 'fahrenheit',
    title: 'Fahrenheit 451',
    authors: ['Ray Bradbury'],
    categories: ['Ciencia ficción'],
    year: 1953,
    copies: 2,
    keywords: 'censura, libros, distopía',
    synopsis:
      'Guy Montag es bombero: su trabajo es quemar libros. Hasta que empieza a leerlos. Una novela sobre la censura y el valor de la memoria.',
  },
  {
    key: 'sapiens',
    title: 'Sapiens',
    authors: ['Yuval Noah Harari'],
    categories: ['Historia', 'Ensayo'],
    year: 2011,
    copies: 2,
    keywords: 'evolución humana, historia de la humanidad',
    synopsis:
      'Un recorrido por la historia de nuestra especie, desde la revolución cognitiva hasta la científica, y por las ficciones compartidas que nos permitieron cooperar a gran escala.',
  },
  {
    key: 'breve-historia',
    title: 'Historia del tiempo',
    authors: ['Stephen Hawking'],
    categories: ['Ciencia y divulgación'],
    year: 1988,
    copies: 1,
    keywords: 'cosmología, agujeros negros, big bang',
    synopsis:
      'Del big bang a los agujeros negros: Stephen Hawking explica para no especialistas las grandes preguntas de la cosmología.',
  },
  {
    key: 'cosmos',
    title: 'Cosmos',
    authors: ['Carl Sagan'],
    categories: ['Ciencia y divulgación'],
    year: 1980,
    copies: 2,
    keywords: 'universo, astronomía, historia de la ciencia',
    synopsis:
      'Carl Sagan recorre la historia de la ciencia y el lugar de la humanidad en el universo, en el libro que acompañó a la célebre serie de televisión.',
  },
  {
    key: 'venas-abiertas',
    title: 'Las venas abiertas de América Latina',
    authors: ['Eduardo Galeano'],
    categories: ['Ensayo', 'Historia'],
    year: 1971,
    copies: 1,
    synopsis:
      'Un ensayo sobre la historia económica y política de América Latina desde la colonia, escrito con la intensidad de una crónica.',
  },
  {
    key: 'laberinto-soledad',
    title: 'El laberinto de la soledad',
    authors: ['Octavio Paz'],
    categories: ['Ensayo'],
    year: 1950,
    copies: 1,
    keywords: 'identidad mexicana',
    synopsis:
      'Ensayos sobre la identidad mexicana, sus fiestas, sus máscaras y su historia, escritos por el premio Nobel Octavio Paz.',
  },
  {
    key: 'bernarda-alba',
    title: 'La casa de Bernarda Alba',
    authors: ['Federico García Lorca'],
    categories: ['Teatro'],
    year: 1936,
    copies: 2,
    synopsis:
      'Tras la muerte de su segundo marido, Bernarda impone a sus cinco hijas ocho años de luto encerradas en casa. La última obra de teatro de García Lorca.',
  },
  {
    key: 'bodas-sangre',
    title: 'Bodas de sangre',
    authors: ['Federico García Lorca'],
    categories: ['Teatro'],
    year: 1933,
    copies: 1,
    synopsis:
      'Una boda en el campo andaluz se convierte en tragedia cuando la novia huye con su antiguo amor. Teatro poético sobre el deseo y el destino.',
  },
  {
    key: 'vida-sueno',
    title: 'La vida es sueño',
    authors: ['Pedro Calderón de la Barca'],
    categories: ['Teatro', 'Clásicos'],
    year: 1635,
    copies: 1,
    synopsis:
      'Segismundo, encerrado desde niño en una torre, despierta un día como príncipe. Una reflexión en verso sobre la libertad, el destino y la realidad.',
  },
  {
    key: 'coronel',
    title: 'El coronel no tiene quien le escriba',
    authors: ['Gabriel García Márquez'],
    categories: ['Novela', 'Autores colombianos'],
    year: 1961,
    copies: 2,
    synopsis:
      'Un coronel retirado espera desde hace quince años la carta que le concederá su pensión. Una novela breve sobre la dignidad y la espera.',
  },
  {
    key: 'delirio',
    title: 'Delirio',
    authors: ['Laura Restrepo'],
    categories: ['Novela', 'Autores colombianos'],
    year: 2004,
    copies: 2,
    featured: true,
    keywords: 'Bogotá, años ochenta',
    synopsis:
      'Aguilar vuelve de un viaje y encuentra a su esposa, Agustina, sumida en la locura. En la Bogotá de los años ochenta, intenta reconstruir qué pasó. Premio Alfaguara de Novela 2004.',
  },
  {
    key: 'harry-potter',
    title: 'Harry Potter y la piedra filosofal',
    authors: ['J. K. Rowling'],
    categories: ['Infantil y juvenil'],
    year: 1997,
    copies: 3,
    synopsis:
      'Harry descubre, el día que cumple once años, que es mago, y empieza su primer curso en el Colegio Hogwarts de Magia y Hechicería.',
  },
  {
    key: 'momo',
    title: 'Momo',
    authors: ['Michael Ende'],
    categories: ['Infantil y juvenil'],
    year: 1973,
    copies: 1,
    synopsis:
      'Una niña con el don de escuchar se enfrenta a los hombres grises, que roban el tiempo de las personas. Un clásico juvenil sobre el valor del tiempo.',
  },
  {
    key: 'metamorfosis',
    title: 'La metamorfosis',
    authors: ['Franz Kafka'],
    categories: ['Clásicos'],
    year: 1915,
    copies: 2,
    synopsis:
      'Gregorio Samsa despierta una mañana convertido en un insecto monstruoso. Un relato sobre la alienación y la familia.',
  },
  {
    key: 'orgullo-prejuicio',
    title: 'Orgullo y prejuicio',
    authors: ['Jane Austen'],
    categories: ['Clásicos', 'Novela'],
    year: 1813,
    copies: 1,
    synopsis:
      'Elizabeth Bennet y el señor Darcy se juzgan mal desde el primer baile. Una comedia de costumbres sobre el matrimonio, la clase social y las primeras impresiones.',
  },
  {
    key: 'aleph',
    title: 'El Aleph',
    authors: ['Jorge Luis Borges'],
    categories: ['Cuento'],
    year: 1949,
    copies: 1,
    synopsis:
      'Cuentos sobre la inmortalidad, el tiempo y el infinito, entre ellos el que da título al libro: un punto que contiene todos los puntos del universo.',
  },
  {
    key: 'ceguera',
    title: 'Ensayo sobre la ceguera',
    authors: ['José Saramago'],
    categories: ['Novela'],
    year: 1995,
    copies: 2,
    synopsis:
      'Una epidemia de ceguera blanca se extiende por una ciudad sin nombre. Una novela sobre lo que queda de una sociedad cuando nadie puede ver.',
  },
]

/** Junji Ito: manga de terror. */
export const JUNJI_ITO_BOOKS: SeedBook[] = [
  {
    key: 'dissolving-classroom',
    title: 'Dissolving Classroom',
    authors: ['Junji Ito'],
    categories: ['Manga', 'Terror', 'Cuento'],
    year: 2017,
    copies: 1,
    synopsis:
      'Los hermanos Azawa, Yuuma y Chizumi, siembran el horror allá donde van: él se disculpa sin parar y ella oculta un secreto demoníaco. Relatos enlazados de Junji Ito.',
  },
  {
    key: 'smashed',
    title: 'Smashed',
    authors: ['Junji Ito'],
    categories: ['Manga', 'Terror', 'Cuento'],
    year: 2019,
    copies: 1,
    synopsis: 'Antología de relatos de Junji Ito: obsesiones, cuerpos que se transforman y pequeñas pesadillas cotidianas.',
  },
  {
    key: 'uzumaki',
    title: 'Uzumaki',
    authors: ['Junji Ito'],
    categories: ['Manga', 'Terror'],
    year: 1998,
    copies: 2,
    featured: true,
    keywords: 'espirales, Kurouzu-cho, horror cósmico',
    synopsis:
      'En el pueblo de Kurouzu-cho, las espirales empiezan a obsesionar a sus habitantes hasta transformarlos. Kirie y Shuichi intentan escapar de una maldición que lo invade todo. La obra más célebre de Junji Ito.',
  },
  {
    key: 'tomie',
    title: 'Tomie',
    authors: ['Junji Ito'],
    categories: ['Manga', 'Terror'],
    year: 1987,
    copies: 2,
    keywords: 'obsesión, inmortalidad',
    synopsis:
      'Tomie es una chica bellísima que despierta en los hombres un deseo que acaba en violencia. La matan una y otra vez, y siempre regresa. La primera serie de Junji Ito.',
  },
  {
    key: 'gyo',
    title: 'Gyo',
    authors: ['Junji Ito'],
    categories: ['Manga', 'Terror'],
    year: 2001,
    copies: 1,
    keywords: 'peces, Okinawa',
    synopsis:
      'Durante unas vacaciones en Okinawa, Tadashi y Kaori ven salir del mar peces que caminan sobre patas mecánicas. Pronto la invasión llega a Tokio, acompañada de un olor insoportable.',
  },

  {
    key: 'escalofrios',
    title: 'Shiver',
    authors: ['Junji Ito'],
    categories: ['Manga', 'Terror', 'Cuento'],
    year: 2015,
    copies: 1,
    synopsis:
      'Antología de relatos seleccionados por el propio autor, entre ellos «El misterio de la falla de Amigara», con comentarios suyos sobre cada historia.',
  },
  {
    key: 'remina',
    title: 'Remina',
    authors: ['Junji Ito'],
    categories: ['Manga', 'Terror', 'Ciencia ficción'],
    year: 2005,
    copies: 1,
    synopsis:
      'Un astrónomo descubre un planeta y le pone el nombre de su hija, Remina. Cuando el planeta se acerca a la Tierra devorando estrellas, la multitud culpa a la joven.',
  },

]

export const EDITORIAL_PICK = {
  key: 'quijote',
  quote:
    'En un lugar de la Mancha, de cuyo nombre no quiero acordarme, no ha mucho tiempo que vivía un hidalgo de los de lanza en astillero, adarga antigua, rocín flaco y galgo corredor.',
  note:
    'Más de cuatro siglos después, el Quijote sigue siendo la mejor puerta de entrada a la novela moderna: es divertido, es tierno y se deja leer por capítulos sueltos. No hace falta terminarlo en un mes. Pídelo, renuévalo y avanza a tu ritmo.',
}

export const DEMO_USERS = [
  { key: 'admin', name: 'Andrea Molina', email: 'admin@gotagota.example', password: 'AdminGota-2026', role: 'admin' as const },
  {
    key: 'librarian',
    name: 'Julián Pardo',
    email: 'biblioteca@gotagota.example',
    password: 'BibliotecaGota-2026',
    role: 'librarian' as const,
  },
  { key: 'reader', name: 'Valentina Ríos', email: 'lector@gotagota.example', password: 'LectorGota-2026', role: 'reader' as const },
  { key: 'samuel', name: 'Samuel Ortiz', email: 'samuel@gotagota.example', password: 'SamuelGota-2026', role: 'reader' as const },
  { key: 'camila', name: 'Camila Duarte', email: 'camila@gotagota.example', password: 'CamilaGota-2026', role: 'reader' as const },
]
