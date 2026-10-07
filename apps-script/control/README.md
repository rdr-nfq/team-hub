# Backend RDR BBVA — Google Apps Script

API genérica y **dinámica** para leer y modificar **cualquier dato modificable** del
libro `Control - RDR BBVA` desde Apps Script o como backend web (JSON).

## Idea central

El backend distingue dos tipos de celda:

| Tipo | Detección | Comportamiento |
|---|---|---|
| **Modificable** (input) | la celda **no** tiene fórmula | se lee y se escribe libremente |
| **Calculada** (derivada) | la celda **tiene** fórmula (`P/Q/R` de Iniciativas, rentabilidades, totales, bolsas…) | se lee siempre; **no se sobrescribe** salvo `force:true` |

Así nunca rompes el modelo de cálculo del Excel por accidente. Todo es dinámico:
no hay celdas "hardcodeadas", se descubre la estructura en tiempo real (cabeceras,
fórmulas, dimensiones).

---

## 1. Pasar el Excel a Google Sheets

Apps Script trabaja sobre Google Sheets, no sobre `.xlsx`.

1. Sube `Control - RDR BBVA.xlsx` a Google Drive.
2. Botón derecho → **Abrir con → Hojas de cálculo de Google** (o *Archivo → Importar*).
   - Las fórmulas estándar se conservan. Revisa fórmulas de matriz / `#REF!` heredados.
3. Copia el **ID** de la URL: `https://docs.google.com/spreadsheets/d/`**`<ID>`**`/edit`.

## 2. Crear el proyecto Apps Script

**Opción A — ligado a la hoja (más simple):**
- En el Google Sheet: *Extensiones → Apps Script*.
- Pega `Codigo_Control.gs`. Deja `CONFIG.SPREADSHEET_ID = ''` (usa la hoja activa).

**Opción B — standalone (backend independiente):**
- [script.google.com](https://script.google.com) → *Nuevo proyecto*.
- Pega `Codigo_Control.gs` y pon `CONFIG.SPREADSHEET_ID = '<ID>'`.

En ambos casos: **cambia `CONFIG.API_TOKEN`** por un token largo y secreto.

> El manifiesto `appsscript.json` ya pide los permisos correctos. Si no lo ves en el
> editor: *Configuración del proyecto → "Mostrar appsscript.json"* y pega su contenido.

## 3. Autorizar permisos

En el editor, ejecuta una vez `_test_lectura` (botón ▶). Acepta los permisos de
Hojas de cálculo. Si todo va bien, verás el log con las pestañas.

## 4. Desplegar como API web

*Desplegar → Nueva implementación → Tipo: Aplicación web*
- **Ejecutar como:** Yo.
- **Acceso:** Cualquier usuario (la seguridad la da el `token`).
- Copia la **URL `/exec`**.

---

## Uso de la API

Todas las llamadas llevan `action` y `token`. Lecturas simples por **GET**;
escrituras y objetos complejos por **POST** con cuerpo JSON.

### Comprobar conexión (sin token)
```
GET  <URL>/exec?action=ping
```

### Metadatos y estructura
```
GET  <URL>/exec?action=meta&token=TOKEN
GET  <URL>/exec?action=sheets&token=TOKEN
```

### Leer
```
# Toda una iniciativa con su máscara editable:
GET  <URL>/exec?action=read&sheet=1) Iniciativas&a1=B7:S7&token=TOKEN

# Sólo lo modificable (sin fórmulas) de una hoja:
GET  <URL>/exec?action=modifiable&sheet=6) Gastos&token=TOKEN

# Tabla como registros {cabecera: valor} (cabecera/inicio se autodetectan por esquema):
GET  <URL>/exec?action=table&sheet=6) Gastos&token=TOKEN

# Filtrada:
POST <URL>/exec
{ "token":"TOKEN", "action":"table", "sheet":"1) Iniciativas",
  "where": { "Estado": "Finalizado" } }
```

### Escribir (una celda)
```
POST <URL>/exec
{ "token":"TOKEN", "action":"write",
  "sheet":"6) Gastos", "a1":"E5", "value": 150 }
```
Escribir una **fórmula**: `"value":"=F6-SUM(J6:J8)"`.
Sobrescribir una **celda calculada**: añade `"force": true`.

### Modificar una fila por columnas (sin saber letras)
```
POST <URL>/exec
{ "token":"TOKEN", "action":"updateRow",
  "sheet":"1) Iniciativas", "row": 7,
  "patch": { "Estado":"En curso", "Comentarios":"Revisado" } }
```

### Añadir un registro
```
POST <URL>/exec
{ "token":"TOKEN", "action":"append",
  "sheet":"6) Gastos",
  "data": { "Fecha":"2026-06-01", "Persona":"Ana", "Detalle":"Guardia", "Importe":120 } }
```

### Lote
```
POST <URL>/exec
{ "token":"TOKEN", "action":"batch",
  "updates": [
    { "sheet":"6) Gastos", "a1":"E5", "value":150 },
    { "sheet":"6) Gastos", "a1":"D5", "value":"Texto" }
  ] }
```

### Buscar
```
GET  <URL>/exec?action=search&query=SDATOOL-53661&numberedOnly=true&token=TOKEN
```

### Ejemplo con `fetch` (frontend)
```js
const r = await fetch(URL, {
  method: 'POST',
  // text/plain evita el preflight CORS de Apps Script
  headers: { 'Content-Type': 'text/plain;charset=utf-8' },
  body: JSON.stringify({ token: TOKEN, action: 'updateRow',
    sheet: '1) Iniciativas', row: 7, patch: { Estado: 'En curso' } })
});
const json = await r.json();   // { ok, action, data }
```

---

## Respuesta

```jsonc
{ "ok": true, "action": "read", "data": { ... } }   // éxito
{ "ok": false, "error": "La celda ... contiene una fórmula. Usa force:true ..." }
```

## Acciones disponibles

`ping · meta · sheets · read · readCell · modifiable · write · writeRange · batch ·
table · row · updateRow · append · search` — ver `action=help`.

## Notas / límites

- **Tipos al escribir**: `"440"` → número, `"true"` → booleano, `"2026-01-01"` → fecha,
  `"=..."` → fórmula. Desactiva con `CONFIG.AUTO_TYPE = false`.
- **Concurrencia**: Apps Script no bloquea por defecto. Para escrituras intensivas,
  envuelve con `LockService` si varios clientes escriben a la vez.
- **Hojas "bloques"** (`3) Control Economico.`, `7) Costes`, `8) Seg. Contable`,
  `9) Capacidad`): no son tablas planas; usa `read`/`write`/`modifiable` por celda/rango
  en vez de `table`.
- **CORS**: para llamadas desde navegador usa `Content-Type: text/plain` (evita preflight).
