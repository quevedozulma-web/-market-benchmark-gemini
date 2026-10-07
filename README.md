# Market Benchmark - versión pública con Gemini

Esta carpeta contiene la conversión de `market-benchmark-app.html` a una aplicación web pública que ya no depende de Claude.

## Arquitectura

- **Frontend:** el mismo HTML/React del aplicativo original, servido como archivo estático.
- **IA y búsqueda web:** Gemini 2.5 Flash con Google Search grounding.
- **Backend:** Cloudflare Worker. La API key de Gemini queda como un secreto del Worker y nunca se publica en el HTML.
- **Almacenamiento:** `localStorage` del navegador. Cada usuario conserva sus propias búsquedas en su dispositivo/navegador.
- **PowerPoint:** descarga directa desde el navegador. Ya no depende de `window.claude.use("downloads")`.

## Qué cambió frente al HTML original

1. `Request search` se convirtió en `Search postings`.
2. Ya no existe el paso de escribir `procesa` en Claude.
3. El botón llama a `/api/search` automáticamente.
4. El Worker llama a Gemini y devuelve las ofertas normalizadas.
5. Las ofertas se guardan localmente en el navegador.
6. `window.claude.use("db")` y `window.claude.use("downloads")` se sustituyen por una capa de compatibilidad local, para conservar la interfaz ya compilada.

## Requisitos gratuitos

1. Una cuenta de Google para crear una Gemini API key en Google AI Studio.
2. Una cuenta gratuita de Cloudflare.
3. Node.js instalado en Windows para hacer el primer despliegue por línea de comandos.

## Paso 1: obtener la API key de Gemini

En Google AI Studio crea una API key de Gemini. No pegues esa clave dentro de `public/index.html`.

## Paso 2: instalar dependencias

Abre PowerShell o CMD dentro de esta carpeta y ejecuta:

```bash
npm install
```

## Paso 3: iniciar sesión en Cloudflare

```bash
npx wrangler login
```

Se abrirá el navegador para autorizar tu cuenta de Cloudflare.

## Paso 4: guardar la API key de forma segura

Ejecuta:

```bash
npx wrangler secret put GEMINI_API_KEY
```

Wrangler pedirá la clave. Pégala y presiona Enter. Cloudflare la guarda como secreto cifrado; no queda dentro de los archivos públicos.

El modelo por defecto está definido en `wrangler.jsonc`:

```json
"GEMINI_MODEL": "gemini-2.5-flash"
```

## Paso 5: publicar

```bash
npm run deploy
```

Cloudflare mostrará una URL similar a:

```text
https://market-benchmark-gemini.<tu-subdominio>.workers.dev
```

Esa URL ya se puede abrir desde Chrome, Edge, Safari o un teléfono y compartir con otras personas.

## Probar localmente antes de publicar

Copia `.dev.vars.example` como `.dev.vars` y pega tu clave:

```text
GEMINI_API_KEY="TU_CLAVE"
```

Después ejecuta:

```bash
npm run dev
```

Wrangler mostrará una URL local, normalmente `http://localhost:8787`.

## Importante sobre privacidad

Esta versión solo envía a Gemini los parámetros necesarios para buscar vacantes públicas: cargo, país, ciudad e idioma. Las ofertas guardadas y el histórico de cada usuario permanecen en `localStorage` de su navegador.

No uses el free tier para enviar información confidencial de empleados, salarios individuales, bandas internas o decisiones privadas de compensación.

## Importante sobre el uso público

Gemini 2.5 Flash tiene límites en el free tier. Una aplicación expuesta públicamente puede consumir ese cupo si muchas personas o bots hacen búsquedas. Para una prueba o uso controlado esta versión es suficiente. Para una publicación abierta a gran escala, el siguiente paso recomendado es agregar Cloudflare Turnstile y/o rate limiting.

## Archivos

- `public/index.html`: aplicativo visible para el usuario.
- `src/worker.js`: endpoint `/api/search` que protege la API key y consulta Gemini.
- `wrangler.jsonc`: configuración de Cloudflare Worker + static assets.
- `package.json`: scripts de desarrollo y despliegue.
- `.dev.vars.example`: ejemplo de variables locales; nunca subir una `.dev.vars` real a un repositorio.

## Endpoint de diagnóstico

Después del despliegue puedes abrir:

```text
https://TU-URL/api/health
```

Debe responder algo como:

```json
{"ok":true,"geminiConfigured":true,"model":"gemini-2.5-flash"}
```

Si `geminiConfigured` aparece como `false`, falta configurar el secreto `GEMINI_API_KEY`.
Deployment initialized
