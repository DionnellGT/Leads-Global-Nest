# Leads App — Backend NestJS

Guarda automáticamente los leads de Facebook/Instagram Lead Ads en tu propia
base de datos (Neon PostgreSQL), y permite filtrarlos y exportarlos a Excel.

## Instalación

```bash
npm install
cp .env.example .env
# edita .env con tus credenciales reales
npm run start:dev
```

## Configuración en Meta Developer

1. Crea la app en https://developers.facebook.com (tipo "Empresa").
2. Agrega el producto **Webhooks**.
3. En "Configurar webhooks" → objeto **Page** → URL de callback:
   `https://tu-dominio.com/webhook/facebook`
   Token de verificación: el mismo que pusiste en `FB_VERIFY_TOKEN`.
4. Suscríbete al campo **`leadgen`**.
5. Agrega el producto **Marketing API** y obtén un **Page Access Token**
   con los permisos: `pages_manage_metadata`, `pages_read_engagement`,
   `leads_retrieval`. Ponlo en `FB_PAGE_ACCESS_TOKEN`.

> Nota: mientras desarrollas, usa [ngrok](https://ngrok.com) para exponer tu
> `localhost:3000` con una URL https pública y poder registrar el webhook.

## Endpoints disponibles

| Método | Ruta                    | Descripción                                  |
|--------|-------------------------|-----------------------------------------------|
| GET    | `/webhook/facebook`     | Verificación del webhook (la usa Meta)         |
| POST   | `/webhook/facebook`     | Recibe el evento cuando llega un nuevo lead    |
| GET    | `/leads`                | Lista leads (filtros: desde, hasta, estado, formId, campaignId, search) |
| PATCH  | `/leads/:id/estado`     | Cambia el estado de un lead                    |
| GET    | `/leads/export`         | Descarga un `.xlsx` con los leads filtrados    |

## Ejemplo de filtro

```
GET /leads?desde=2026-07-20&hasta=2026-07-24&estado=Nuevo
GET /leads/export?desde=2026-07-20&hasta=2026-07-24
```

## Próximos pasos sugeridos

- Frontend en React con la tabla de leads, filtros y botón "Exportar Excel"
  (llamando a `GET /leads` y `GET /leads/export`).
- Autenticación para proteger los endpoints (JWT).
- Notificaciones automáticas (correo/WhatsApp) al llegar un lead nuevo.
