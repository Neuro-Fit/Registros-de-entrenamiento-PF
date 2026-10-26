NEUROFIT PERFORMANCE LAB — GUÍA DE INSTALACIÓN (SUPABASE + PDF)

ARCHIVOS
- index.html: estructura de la aplicación y pantalla de acceso por correo.
- styles.css: diseño visual adaptable a escritorio y móvil.
- app.js: perfiles, cargas, pruebas, gráficos, sincronización remota y reportes PDF.
- supabase-config.js: aquí se pegan la URL del proyecto y la clave pública (publishable/anon).
- supabase-setup.sql: tabla compartida, seguridad RLS y activación de Realtime.

ANTES DE EMPEZAR
Necesitas una cuenta de Supabase y una conexión a internet. El proyecto y las cuentas no se crean automáticamente desde estos archivos: debes conectar tu propio proyecto siguiendo los pasos siguientes.

1. CREA EL PROYECTO SUPABASE
- Entra en https://supabase.com/ y crea un proyecto.
- En Project Settings > API Keys copia el Project URL y la Publishable key (o la anon key heredada).
- Abre supabase-config.js y reemplaza TU-PROYECTO y PEGA_AQUI_TU_PUBLISHABLE_KEY por los valores reales.
- No pegues nunca una secret key o service_role en archivos del navegador.

2. CREA LA TABLA Y SUS POLÍTICAS
- En el panel de Supabase abre SQL Editor > New query.
- Copia el contenido completo de supabase-setup.sql y ejecútalo.
- La tabla guarda un conjunto de datos JSON compartido por todas las cuentas autorizadas del proyecto.
- La política permite leer y editar a usuarios autenticados; por eso es obligatorio mantener acceso restringido a cuentas invitadas.

3. RESTRINGE EL ACCESO A PERSONAS AUTORIZADAS
- En Supabase abre Authentication > Sign In / Providers (el nombre puede variar) y desactiva los registros públicos/sign-ups.
- En Authentication > Users, invita o crea el usuario para tu correo y para cada colaborador autorizado.
- En SQL Editor, sustituye los correos de ejemplo del bloque final de supabase-setup.sql por los correos exactos que quieres autorizar y ejecuta ese INSERT. Añade o elimina correos de public.neurofit_allowed_users desde el panel de Supabase.
- No habilites el acceso anónimo. La tabla de datos y las políticas RLS comprueban la lista permitida, por lo que una cuenta no autorizada no debería poder leer ni editar el conjunto compartido.
- El acceso de NeuroFit se realiza con enlace mágico enviado al correo; no se crea cuenta nueva desde la página (shouldCreateUser=false).
- Para que el envío de correos sea fiable en uso real, configura un proveedor SMTP propio en los ajustes de Authentication/SMTP.

4. ABRE LA WEB
- Conserva todos los archivos juntos en una misma carpeta.
- Abre la carpeta en VS Code e inicia Live Server desde index.html. No uses file://, porque Supabase necesita una URL de origen admitida.
- En Authentication > URL Configuration añade la URL que use Live Server (por ejemplo, http://127.0.0.1:5500) a Redirect URLs. Añade también el dominio final cuando publiques la web.
- Entra con el correo que ya invitaste y abre el enlace que recibirás por email.

5. MIGRACIÓN DE DATOS LOCALES
- Al iniciar sesión por primera vez, si la tabla compartida aún no tiene datos, la web intenta subir los datos existentes del navegador actual.
- Si ya existe un conjunto de datos en la nube, este se considera la versión principal y reemplaza el estado local del navegador tras iniciar sesión.
- Antes de conectar, descarga un respaldo JSON desde la versión local anterior si necesitas conservar información.

6. SINCRONIZACIÓN ENTRE DISPOSITIVOS
- Inicia sesión con un correo autorizado desde cada dispositivo; los datos compartidos se cargan desde Supabase.
- Los cambios se sincronizan automáticamente tras una breve pausa y los cambios recibidos desde otro dispositivo se reflejan en pantalla.
- La implementación guarda el conjunto completo en un único registro JSON. Es adecuada para un equipo pequeño, pero si dos personas editan al mismo tiempo, gana la última escritura y podrían sobrescribirse cambios simultáneos. Para equipos grandes o edición concurrente intensiva conviene migrar cada tipo de registro a tablas relacionales separadas.
- Exporta un respaldo JSON regularmente.

INFORMES PDF
- Perfil de cada alumno > botón “Informe PDF”.
- Menú “Reportes y exportaciones” > selecciona alumno para PDF individual.
- En ese menú también puedes generar un PDF grupal, con resumen general y una sección completa por alumno.
- Los PDF incluyen medidas y edad, IMC como valor orientativo, estimación energética si hay datos, historial de fuerza, pruebas, evolución de resultados y recomendaciones.
- Las bibliotecas PDF se cargan desde CDN; para generarlos necesitas conexión a internet.

PRIVACIDAD Y USO RESPONSABLE
- Los datos se comparten con TODAS las cuentas autenticadas del mismo proyecto. Invita únicamente a personas autorizadas y nunca habilites el acceso anónimo.
- La clave pública/publishable se puede usar en el navegador si la tabla tiene RLS y las políticas correctas. Nunca pongas claves secretas en el frontend.
- Los informes pueden contener información de menores. Comparte los PDF de forma privada y conserva las copias en un lugar seguro.
- Para menores, el IMC requiere interpretación por edad y sexo; el número del informe no clasifica ni diagnostica. La estimación energética no es una dieta personalizada ni debe usarse para fijar restricciones de energía a jóvenes.

SOLUCIÓN DE PROBLEMAS
- “Supabase no está configurado”: revisa URL y clave en supabase-config.js.
- “relation neurofit_data does not exist”: vuelve a ejecutar supabase-setup.sql.
- “Error de permisos / no aparecen datos”: confirma que el email de la sesión esté escrito en public.neurofit_allowed_users y que el usuario exista en Authentication > Users.
- No llega el correo: confirma que la cuenta exista/invitada, la URL de redirección esté permitida y el proveedor de correo funcione.
- Los cambios no aparecen en otro dispositivo: revisa conexión, que ambos inicien sesión en el mismo proyecto y que Realtime esté activado para public.neurofit_data.
- El PDF no se genera: revisa conexión a internet, porque jsPDF y AutoTable se cargan desde CDN.
