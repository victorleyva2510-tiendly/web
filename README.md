# Hospedoggy

Plataforma de hospedaje para perros en Lima, con tres vistas:

- `/` clientes: búsqueda de casas, cotización, ficha del perro, pago con Mercado Pago (Yape o tarjeta), confirmación, chat con el cuidador, reportes con fotos, reseñas y cancelación con devolución automática.
- `/cuidador/` cuidadores: reportes con fotos, chat con datos de contacto ocultos, tarifas y temporadas, plazas por fechas, perfil revisado por Hospedoggy y pagos. Las cuentas las crea solo el administrador.
- `/admin/` administrador: tablero, reservas, cuidadores y fotos, incidencias, pagos a cuidadores, correos enviados y configuración.

## Qué hay en cada carpeta

- `public/`: las páginas (cliente, `cuidador/` y `admin/`), estilos y código del navegador. Las fotos se guardan en Supabase Storage.
- `netlify/functions/`: el servidor. Calcula precios, separa cupos, crea el pago en Mercado Pago, recibe sus avisos y envía correos.
- `netlify/lib/`: piezas compartidas por esas funciones.
- `package.json`: le dice a Netlify que esto es un proyecto web. No instala nada.

Este repositorio es público, así que aquí no hay claves, tarifas de cuidadores ni márgenes: todo eso vive en Supabase y en las variables de Netlify. El archivo de la base de datos (`supabase/esquema.sql`) y las pruebas se guardan aparte, fuera de GitHub.

## Variables de entorno (se ponen en Netlify, nunca en el código)

| Nombre | Qué es |
|---|---|
| `SUPABASE_URL` | Project URL de Supabase |
| `SUPABASE_SERVICE_KEY` | Secret key de Supabase (`sb_secret_...`) |
| `MP_ACCESS_TOKEN` | Access Token de Mercado Pago (`APP_USR-...`) |
| `MP_WEBHOOK_SECRET` | Clave secreta de las notificaciones (Webhooks) de Mercado Pago |
| `RESEND_API_KEY` | API key de Resend (`re_...`) |
| `EMAIL_ADMIN` | Tu correo: te llega cada reserva, cancelación o alerta |
| `EMAIL_REMITENTE` | Opcional. Cuando verifiques tu dominio: `Hospedoggy <reservas@hospedoggy.pe>` |
| `SITIO_URL` | Opcional. Cuando tengas dominio: `https://hospedoggy.pe` |

Mientras `EMAIL_REMITENTE` no esté puesto, Resend solo deja enviar a tu propio correo. Por eso todos los correos (cliente y cuidador) te llegan a ti con "[Reenviar a ...]" en el asunto.
