// Compartido por la web y la API: las mismas preguntas y validaciones.
const f = (id, label, type = 'textarea', min = 60, extra = {}) => ({ id, label, type, min, ...extra });
const q = (title, description, fields) => ({ title, description, fields });
export const stages = [
  {
    title: 'Información y actividad', intro: 'Antes de continuar con la postulación, necesitamos conocer mejor tu actividad, disponibilidad y situación dentro de Discord.',
    instruction: 'Desarrolla y justifica tus respuestas. “Sí”, “no”, “mucho”, “normal”, “porque sí” o respuestas sin explicación se considerarán incompletas. Los datos como edad e ID pueden ser breves.',
    questions: [
      q('Edad', 'Indica tu edad actual y explica cuánto tiempo llevas utilizando Discord y participando activamente en comunidades.', [f('edad','Edad actual','number',0,{minimum:13,maximum:100}),f('trayectoria','Tiempo en Discord y participación en comunidades')]),
      q('ID de Discord', 'Proporciona tu ID de usuario de Discord, no tu nombre de usuario. Indica aproximadamente cuánto tiempo llevas utilizando tu cuenta actual.', [f('discordId','ID de Discord','text',0,{pattern:'^[0-9]{17,20}$'}), f('antiguedad','Antigüedad aproximada de la cuenta','text',3)]),
      q('Actividad dentro de nuestro servidor', 'Del 1 al 10, ¿qué tan activo consideras que eres? Justifica el nivel, menciona los canales donde participas, qué haces cuando estás conectado y desde cuándo participas activamente.', [f('actividad','Nivel de actividad','number',0,{minimum:1,maximum:10}), f('actividadDetalle','Justificación, canales, actividades y tiempo participando', 'textarea',100)]),
      q('Disponibilidad', 'Indica cuánto tiempo puedes dedicar aproximadamente al servidor. Explica si tu disponibilidad es estable o cambia frecuentemente.', [f('semana','Entre semana','text',3),f('finSemana','Fines de semana','text',3),f('horario','Horarios habituales y zona horaria','text',5), f('estabilidad','Estabilidad de tu disponibilidad')]),
      q('Servidores en los que participas', 'Menciona los servidores en los que actualmente seas realmente activo. Por cada uno indica: nombre, cantidad aproximada de miembros, tiempo dentro, actividad del 1 al 10, si eres Staff y tu cargo, qué haces allí y por qué sigues participando. No basta con una lista de nombres.', [f('servidores','Detalle de cada servidor. Si solo participas aquí, explica tu actividad en esta comunidad.','textarea',100)]),
      q('Cuentas alternativas', 'Indica todas las cuentas alternativas que utilices o hayas utilizado dentro de nuestro servidor. Por cada ALT: ID de Discord, motivo de uso y última vez que la utilizaste aproximadamente. Si no tienes ninguna, declara que nunca has utilizado cuentas alternativas dentro del servidor.', [f('alts','Cuentas ALT o declaración de que no has utilizado ninguna','textarea',30)]),
      q('Tu situación dentro de la comunidad', 'Describe cómo te llevas con otros usuarios, si has tenido conflictos recientes o recibido advertencias o sanciones y qué reputación crees que tienes. La sinceridad se valorará más que intentar parecer perfecto.', [f('comunidad','Relación, conflictos, sanciones y reputación','textarea',100)])
    ]
  },
  {
    title:'Experiencia y capacidad',intro:'En esta etapa queremos conocer tu experiencia real administrando comunidades.',instruction:'No basta con decir que sabes moderar. Explica qué sabes hacer, dónde lo aprendiste y cómo lo has utilizado. Si no tienes experiencia, dilo con sinceridad.',
    questions:[
      q('Experiencia previa como Staff','¿Has formado parte del Staff de algún servidor? Si tienes experiencia, completa por cada servidor: nombre, miembros aproximados, cargo, tiempo en el Staff, responsabilidades, herramientas, motivo de salida y qué aprendiste. Si nunca has sido Staff, explica por qué podrías desempeñar el cargo, qué conocimientos tienes y qué necesitarías aprender primero.',[f('experiencia','Experiencia detallada o conocimientos y necesidades de aprendizaje','textarea',140)]),
      q('Herramientas de moderación','Explica cuáles sabes utilizar: warns, timeouts, kicks, bans, logs, tickets, bots, AutoMod, gestión de canales y roles, permisos y verificación. Elige al menos tres y explica cómo funcionan o cuándo las utilizarías.',[f('herramientas','Herramientas conocidas y explicación de al menos tres','textarea',120)]),
      q('Conocimiento sobre sanciones','Explica con tus propias palabras las diferencias. Después responde si siempre debe utilizarse la sanción más fuerte disponible y justifica tu respuesta.',[f('warn','Advertencia'),f('timeout','Timeout'),f('kick','Kick'),f('ban','Ban'),f('sancionFuerte','¿Siempre debe utilizarse la sanción más fuerte? ¿Por qué?')]),
      q('Historial disciplinario','¿Has recibido sanciones importantes en servidores de Discord? Explica qué ocurrió, la sanción recibida, qué hiciste mal, qué aprendiste y qué harías diferente. Si nunca has recibido ninguna, menciona si has tenido advertencias, discusiones fuertes o problemas; si tampoco los has tenido, indícalo claramente.',[f('disciplina','Historial y aprendizajes; o declaración de no tener antecedentes','textarea',60)]),
      q('Motivación','Explica por qué quieres formar parte del Staff: por qué te interesa el cargo, qué mejorarías en el servidor, qué esperas aprender y qué puedes aportar al equipo. “Quiero ayudar” sin explicación es insuficiente.',[f('motivacion','Interés, mejoras, aprendizajes y aportes','textarea',140)]),
      q('Fortalezas','Menciona tres fortalezas útiles para un Staff. Por cada una describe una situación real donde hayas demostrado esa cualidad.',[f('fortaleza1','Fortaleza 1 y ejemplo real'),f('fortaleza2','Fortaleza 2 y ejemplo real'),f('fortaleza3','Fortaleza 3 y ejemplo real')]),
      q('Debilidades','Menciona dos aspectos personales que necesites mejorar. Para cada uno explica por qué es una debilidad, cómo podría afectarte siendo Staff y qué haces para mejorarla. “No tengo debilidades” no es una respuesta válida.',[f('debilidad1','Debilidad 1, impacto y cómo la mejoras'),f('debilidad2','Debilidad 2, impacto y cómo la mejoras')]),
      q('Responsabilidad','Menciona como mínimo cinco responsabilidades de un miembro del Staff y explica brevemente por qué cada una es importante.',[f('responsabilidad','Cinco responsabilidades con su explicación','textarea',160)])
    ]
  },
  {
    title:'Criterio y toma de decisiones',intro:'Esta etapa evaluará cómo reaccionarías ante situaciones reales dentro del servidor.',instruction:'No buscamos una respuesta de una sola frase. Explica qué harías, por qué y qué pasos seguirías. Evaluaremos tu criterio, imparcialidad y madurez.',
    questions:[
      q('Tu amigo rompe una regla','Uno de tus amigos cercanos rompe claramente una regla y, según el reglamento, corresponde una sanción. Explica qué harías, si aplicarías tú la sanción, si influiría tu amistad y cómo actuarías si te pide que lo perdones.',[f('amigo','Decisión, imparcialidad y respuesta a tu amigo','textarea',100)]),
      q('Usuario molesto','Sancionas correctamente a un usuario. Empieza a insultarte, burlarse de ti y decir públicamente que eres un mal Staff. Explica cómo reaccionarías, si responderías a los insultos, qué medidas tomarías y cómo evitarías que el conflicto empeore.',[f('insultos','Reacción, medidas y manejo del conflicto','textarea',100)]),
      q('Staff abusando de permisos','Observas que otro Staff parece utilizar sus permisos para beneficiar a sus amigos. No tienes certeza absoluta, pero hay varias pruebas que parecen indicarlo. Explica qué pruebas buscarías, con quién hablarías, qué evitarías y qué harías si fuera amigo tuyo.',[f('abuso','Pasos, pruebas, comunicación y relación personal','textarea',100)]),
      q('Dos versiones diferentes','Dos usuarios discuten y ambos aseguran que el otro inició el problema. Uno es conocido y respetado; el otro acaba de entrar. No existen pruebas claras inicialmente. Explica a quién escucharías, qué evidencias buscarías, si influiría su reputación y qué harías si nunca consigues pruebas suficientes.',[f('versiones','Investigación y decisión con evidencia insuficiente','textarea',100)]),
      q('Error propio','Baneas a un usuario por una supuesta falta grave. Después descubres que interpretaste mal las pruebas y era inocente. Explica qué harías con la sanción, qué le dirías, si informarías al Staff y cómo evitarías repetir el error.',[f('error','Corrección, comunicación y prevención','textarea',100)]),
      q('Desacuerdo dentro del Staff','Otro Staff toma una decisión que consideras injusta. Explica cómo hablarías con él, dónde discutirías el problema, qué harías si no se ponen de acuerdo y cómo actuarías si finalmente descubres que tú estabas equivocado.',[f('desacuerdo','Conversación, resolución y aceptación de correcciones','textarea',100)]),
      q('No sabes qué hacer','Ocurre una situación que nunca habías visto. No encuentras una regla que explique exactamente qué hacer y eres el único Staff conectado. Explica detalladamente cómo actuarías.',[f('sinRegla','Pasos que seguirías y justificación','textarea',100)]),
      q('Información privada','En los canales del Staff encuentras información sobre una sanción relacionada con alguien que conoces. Tu amigo te pregunta qué está hablando el Staff sobre él. ¿Qué responderías? Explica qué información debe mantenerse privada.',[f('privacidad','Respuesta a tu amigo e información confidencial','textarea',100)]),
      q('Presión de la comunidad','Muchos usuarios exigen públicamente que banees a una persona, pero todavía no hay evidencia suficiente. Explica cómo manejarías al usuario acusado y al resto de la comunidad.',[f('presion','Decisión y manejo de ambas partes','textarea',100)]),
      q('Usuario provocador','Un usuario no rompe ninguna regla grave, pero constantemente provoca discusiones y hace enojar a otros. Explica qué observarías, qué pruebas guardarías, cuándo intervendrías y qué evitarías.',[f('provocador','Observación, evidencia, intervención y límites','textarea',100)]),
      q('Poder administrativo','¿Qué significa para ti tener permisos de Staff? Menciona al menos cinco cosas que nunca debería hacer un Staff aunque tenga permisos para hacerlo.',[f('poder','Significado de los permisos y cinco ejemplos de usos indebidos','textarea',140)]),
      q('Última situación','Un usuario rompe una regla. Puedes A) sancionar inmediatamente, B) investigar primero aunque tardes más o C) ignorarlo porque no parece importante. No elijas solo una opción: explica qué factores analizarías, qué pruebas necesitarías, cómo decidirías la gravedad de la sanción y qué harías si otro Staff te presiona para actuar rápido.',[f('decision','Factores, pruebas, gravedad y respuesta a la presión','textarea',140)]),
      q('Declaración final','¿Por qué podemos confiarte permisos administrativos? Explica qué responsabilidad implica acceder a herramientas capaces de sancionar o afectar a otros usuarios.',[f('confianza','Razones y responsabilidad personal','textarea',100)])
    ]
  }
];

export function validateAnswers(stage, answers) {
  const errors = {};
  if (!stages[stage-1] || !answers || typeof answers !== 'object' || Array.isArray(answers)) return {form:'Respuestas inválidas.'};
  for (const field of stages[stage-1].questions.flatMap(q=>q.fields)) {
    const value = answers[field.id];
    if (typeof value !== 'string' || !value.trim()) { errors[field.id]='Completa este campo.'; continue; }
    if (value.length>6000) {errors[field.id]='Máximo 6000 caracteres.';continue;}
    if(field.type==='number' && (!/^\d+$/.test(value) || +value<field.minimum || +value>field.maximum)) errors[field.id]=`Usa un número entre ${field.minimum} y ${field.maximum}.`;
    if(field.pattern && !(new RegExp(field.pattern)).test(value)) errors[field.id]='Usa un ID numérico de Discord de 17 a 20 dígitos.';
    if(value.trim().length<field.min) errors[field.id]=`Desarrolla tu respuesta: mínimo ${field.min} caracteres.`;
  }
  return errors;
}
