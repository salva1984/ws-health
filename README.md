# MediCopay — Asistente de Cobertura Médica por WhatsApp

<p align="center">
  <img src="https://img.shields.io/badge/Built%20with-Kapso%20Workflows-blue?style=flat-square" alt="Kapso">
  <img src="https://img.shields.io/badge/WhatsApp-Business%20API-green?style=flat-square" alt="WhatsApp">
  <img src="https://img.shields.io/badge/AI-OpenRouter%20%2F%20DeepSeek-orange?style=flat-square" alt="AI">
  <img src="https://img.shields.io/badge/Database-Supabase-purple?style=flat-square" alt="Supabase">
</p>

**MediCopay** es un agente conversacional por WhatsApp que permite a pacientes afiliados a seguros de salud:

1. **Identificarse** con su cédula y ver su perfil de afiliación en tiempo real.
2. **Describir síntomas** en lenguaje natural y recibir una clasificación médica con detección de señales de alarma.
3. **Calcular copagos exactos** por hospital dentro de su red, aplicando deducibles, coaseguro, copagos fijos y tope anual out-of-pocket.
4. **Comparar hospitales** ordenados por costo final y recibir un PDF con la estimación completa.
5. **Encontrar hospitales cercanos** compartiendo su ubicación por WhatsApp, con enlaces directos a Google Maps y comparativa precio vs. proximidad.

---

## El Problema

Los pacientes afiliados a planes de salud **no saben cuánto pagarán** hasta llegar al hospital. El proceso de estimación es opaco, variado por red hospitalaria, y los deducibles consumidos solo se conocen al momento de facturación. Esto genera:

- **Sorpresas financieras** en momentos de vulnerabilidad.
- **Elecciones subóptimas** (ir al hospital más cercano sin saber que hay uno 20% más barato en la misma red).
- **Sobrecarga administrativa** en call centers de aseguradoras respondiendo "¿cuánto pagaría por X?"

---

## Arquitectura

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   WhatsApp      │────▶│  Kapso Workflow  │────▶│  Supabase DB    │
│   (Paciente)    │◄────│  (Graph Engine)  │◄────│  (Afiliados,    │
│                 │     │                  │     │  Tarifas, Planes)│
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │  Cloud Functions │
                       │  • route-message │
                       │  • process-dni   │
                       │  • compute-      │
                       │    estimate      │
                       │  • find-nearest- │
                       │    hospitals     │
                       └──────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │   AI Services    │
                       │  • OpenRouter    │
                       │    (DeepSeek R1) │
                       │    Triage        │
                       │  • Agent Node    │
                       │    (OpenRouter)   │
                       └──────────────────┘
```

### Componentes Clave

| Componente | Tecnología | Rol |
|---|---|---|
| **Workflow Engine** | Kapso | Orquesta el flujo conversacional node-to-node con estado persistente por conversación. |
| **Messaging** | WhatsApp Business API (via Kapso) | Canal nativo del usuario. Soporta texto, botones, ubicación, templates. |
| **Functions** | Cloudflare Workers (deployed via Kapso) | Lógica de negocio: validación de DNI, cálculo actuarial, geolocalización. |
| **Database** | Supabase (PostgreSQL) | Afiliados, planes, tarifas hospitalarias, historial de estimaciones. |
| **AI Triage** | OpenRouter → DeepSeek/deepseek-r1 | Clasifica síntomas, detecta señales de alarma, determina especialidad y urgencia. |
| **AI Chat** | OpenRouter (Kapso Agent Node) | Conversación general, respuestas a dudas sobre copagos y planes. |
| **PDF Engine** | Generador PDF 1.4 inline (Latin-1) | Estimaciones descargables con desglose completo y descargo legal. |
| **Maps** | Google Maps Static + Directions | Mapa estático con marcadores y enlaces de navegación. |

---

## Flujo del Agente (5 Pasos)

```
INBOUND MESSAGE
      │
      ▼
┌──────────────┐
│ route-message│──▶ Si ubicación ──▶ Buscar cercanos
│  (function)  │──▶ Si no afiliado ──▶ Pedir DNI
└──────────────┘──▶ Si afiliado ──▶ Clasificar intención
      │
      ▼
   [IDENTIFY] ──▶ wait_dni ──▶ process-dni ──▶ ✅ Hola {nombre}
      │
      ▼
   [SYMPTOM]  ──▶ wait_symptom ──▶ classify-symptom (AI)
      │                           ├──▶ EMERGENCY ──▶ 🚨 Alerta
      │                           └──▶ NORMAL ──▶ Calcular copagos
      │
      ▼
   [ESTIMATE] ──▶ compute-estimate ─▶ Ranking por costo
      │              └──▶ Tarifa base × Tier multiplier
      │              └──▶ − Deducible remanente
      │              └──▶ × Coaseguro
      │              └──▶ + Copago fijo
      │              └──▶ vs. Tope OOP anual
      │
      ▼
   [SELECT]   ──▶ wait_hospital ─▶ Desglose detallado + PDF
      │
      ▼
   [LOCATION] ──▶ wait_location ─▶ Haversine distance ─▶ Top 3 cercanos
      │                                         + Google Maps link
      │                                         + Comparativa precio vs. distancia
      │
      ▼
   [AGENT]    ──▶ OpenRouter (conversación libre)
```

### 1. Identificación del Paciente
El usuario envía su cédula. El sistema consulta Supabase y devuelve: nombre, plan contratado, deducible consumido YTD, y acumulado del tope out-of-pocket.

### 2. Triage y Clasificación del Síntoma
El paciente describe su síntoma en lenguaje natural. Un modelo de razonamiento estructurado (DeepSeek R1) analiza el texto y devuelve:
- Especialidad médica más adecuada
- Nivel de urgencia (LOW / MEDIUM / HIGH / EMERGENCY)
- Señales de alarma detectadas (máx. 3)
- Si el síntoma es médicamente inverosímil, solicita reformulación sin alarmar.

### 3. Cálculo Actuarial del Copago
Para cada hospital dentro de la red del paciente:
```
1.  Tarifa base × Multiplicador de red (PREFERRED = descuento)
2.  − Deducible remanente del plan (max 0)
3.  × Coaseguro (% definido en el plan)
4.  + Copago fijo del plan
5.  vs. Tope OOP anual: si ya se alcanzó, el plan cubre el excedente
```

### 4. Ranking y Documento
Los hospitales se ordenan ascendentemente por monto final. El usuario selecciona uno por número y recibe:
- Desglose línea por línea del cálculo.
- PDF con estimación completa, comparativa de red y descargo de responsabilidad legal.

### 5. Localización Geográfica
El paciente comparte su ubicación por WhatsApp. El sistema:
- Calcula distancia con la fórmula de Haversine.
- Muestra los 3 hospitales más cercanos con enlaces a Google Maps.
- Contrasta el más cercano vs. el más económico para que el usuario decida entre proximidad y ahorro.

---

## Estructura del Proyecto

```
ws-health/
├── kapso-workflows/              # Directorio principal (CLI sync)
│   ├── kapso.yaml                # Config del proyecto
│   ├── workflows/
│   │   └── medicopay/
│   │       ├── workflow.ts       # Definición del grafo (source of truth)
│   │       ├── definition.json   # Grafo compilado (auto-generado por build)
│   │       └── workflow.yaml     # Metadatos del workflow
│   ├── functions/
│   │   ├── route-message/        # Enrutador inteligente + clasificación IA
│   │   │   ├── index.js
│   │   │   └── function.yaml
│   │   ├── process-dni/          # Validación y consulta de afiliado
│   │   │   ├── index.js
│   │   │   └── function.yaml
│   │   ├── compute-estimate/     # Cálculo actuarial + generación PDF
│   │   │   ├── index.js
│   │   │   └── function.yaml
│   │   └── find-nearest-hospitals/ # Geolocalización Haversine + Google Maps
│   │       ├── index.js
│   │       └── function.yaml
│   └── README-MIGRACION.md       # Notas de migración desde @builderbot
├── functions/                    # Mirror de funciones (legacy / backup)
├── .agents/skills/             # Documentación y scripts de la plataforma
└── README.md                   # Este archivo
```

---

## Montaje desde Cero

### Requisitos Previos

- Node.js 18+ y npm
- Cuenta en [Kapso](https://app.kapso.ai) (invitación beta)
- Cuenta en [Supabase](https://supabase.com) (proyecto gratuito)
- Cuenta en [OpenRouter](https://openrouter.ai) (API key gratuita)
- Número de WhatsApp Business API conectado a Kapso
- (Opcional) Google Maps API Key para mapas estáticos

### 1. Instalar la CLI de Kapso

```bash
npm install -g @kapso/cli
kapso login
```

### 2. Clonar y vincular el proyecto

```bash
git clone <repo-url>
cd ws-health/kapso-workflows
kapso link --project <tu-project-id>
```

### 3. Crear tablas en Supabase

Ejecuta este SQL en el SQL Editor de Supabase:

```sql
-- Afiliados
CREATE TABLE affiliate (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dni TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  plan_id UUID REFERENCES insurance_plan(id),
  deductible_consumed_ytd NUMERIC DEFAULT 0,
  oop_consumed_ytd NUMERIC DEFAULT 0
);

-- Planes de salud
CREATE TABLE insurance_plan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  deductible_annual NUMERIC NOT NULL,
  coinsurance_pct NUMERIC NOT NULL, -- ej. 0.20 = 20%
  copay_fixed NUMERIC DEFAULT 0,
  oop_max_annual NUMERIC NOT NULL,
  preferred_multiplier NUMERIC DEFAULT 1 -- ej. 0.85 = 15% descuento
);

-- Hospitales
CREATE TABLE hospital (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  network_tier TEXT CHECK (network_tier IN ('PREFERRED', 'STANDARD', 'OUT_OF_NETWORK')),
  lat NUMERIC,
  lng NUMERIC
);

-- Tarifas por especialidad
CREATE TABLE hospital_tariff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID REFERENCES hospital(id),
  specialty_id TEXT NOT NULL, -- ej. 'CARDIOLOGY'
  base_price NUMERIC NOT NULL
);

-- Especialidades (lookup)
CREATE TABLE specialty (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

-- Log de estimaciones generadas
CREATE TABLE estimate_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dni TEXT NOT NULL,
  phone TEXT,
  symptom_raw TEXT,
  specialty_id TEXT,
  hospital_id UUID REFERENCES hospital(id),
  base_price NUMERIC,
  final_copay NUMERIC,
  pdf_url TEXT,
  created_at TIMESTAMP DEFAULT now()
);

-- Seed de especialidades
INSERT INTO specialty (id, name) VALUES
('GENERAL','Medicina General'),
('CARDIOLOGY','Cardiología'),
('ORTHOPEDICS','Traumatología'),
('PEDIATRICS','Pediatría'),
('DERMATOLOGY','Dermatología'),
('GASTRO','Gastroenterología'),
('OPHTHALMOLOGY','Oftalmología'),
('OTORHINO','Otorrinolaringología'),
('PSYCHIATRY','Psiquiatría'),
('GYNECOLOGY','Ginecología'),
('UROLOGY','Urología'),
('NEUROLOGY','Neurología'),
('ENDOCRINOLOGY','Endocrinología'),
('PNEUMOLOGY','Neumología'),
('EMERGENCY','Emergencias');
```

### 4. Crear bucket de Storage para PDFs

En Supabase Dashboard → Storage → New Bucket:
- Nombre: `estimates`
- Política: público (para URLs de descarga)

### 5. Configurar variables de entorno

En Kapso Dashboard → Functions → Settings, o via CLI:

```bash
# Supabase
SUPABASE_URL=https://<tu-proyecto>.supabase.co
SUPABASE_KEY=<tu-service-role-key>
SUPABASE_STORAGE_BUCKET=estimates

# AI
OPENROUTER_API_KEY=<tu-key-de-openrouter>
OPENROUTER_MODEL_REASONING=deepseek/deepseek-r1

# Google Maps (opcional)
GOOGLE_MAPS_API_KEY=<tu-key>
```

### 6. Seed de datos de demo

```sql
-- Plan de demo
INSERT INTO insurance_plan (id, name, deductible_annual, coinsurance_pct, copay_fixed, oop_max_annual, preferred_multiplier)
VALUES (gen_random_uuid(), 'Plan Básico', 500, 0.20, 25, 3000, 0.85);

-- Afiliados de demo
INSERT INTO affiliate (dni, full_name, plan_id, deductible_consumed_ytd, oop_consumed_ytd)
VALUES
('1712345678', 'Juan García', (SELECT id FROM insurance_plan WHERE name='Plan Básico'), 0, 0),
('0998765432', 'María López', (SELECT id FROM insurance_plan WHERE name='Plan Básico'), 250, 500),
('1798765432', 'Carlos Ruiz', (SELECT id FROM insurance_plan WHERE name='Plan Básico'), 500, 1200),
('1701234567', 'Ana Torres', (SELECT id FROM insurance_plan WHERE name='Plan Básico'), 100, 800),
('1234567890', 'Pedro Vargas', (SELECT id FROM insurance_plan WHERE name='Plan Básico'), 0, 0);

-- Hospitales de demo (Guayaquil, Ecuador)
INSERT INTO hospital (id, name, address, network_tier, lat, lng)
VALUES
(gen_random_uuid(), 'Hospital Metropolitano', 'Av. Juan Tanca Marengo, Guayaquil', 'PREFERRED', -2.1523, -79.8921),
gen_random_uuid(), 'Clínica Kennedy Norte', 'Cdla. Kennedy Norte, Guayaquil', 'STANDARD', -2.1689, -79.9012),
gen_random_uuid(), 'Hospital del Río', 'Av. Quito, Guayaquil', 'PREFERRED', -2.1890, -79.8834),
gen_random_uuid(), 'Clínica Guayaquil', 'Centro de Guayaquil', 'STANDARD', -2.2034, -79.8976);
```

### 7. Deploy del workflow y funciones

```bash
cd kapso-workflows

# Compilar el grafo desde workflow.ts → definition.json
kapso build

# Verificar qué se va a subir (dry-run)
kapso push --dry-run

# Subir todo: workflow + funciones
kapso push

# Si solo quieres subir una función específica:
kapso push function route-message
```

### 8. Configurar trigger de WhatsApp

```bash
# Listar números conectados
kapso whatsapp numbers list

# El workflow.yaml ya incluye el phoneNumberId.
# Si necesitas cambiarlo:
kapso workflow update medicopay --trigger inbound_message --phone-number-id <TU_PHONE_NUMBER_ID>
```

### 9. Probar

Envía un WhatsApp al número conectado con cualquiera de estos DNIs de demo:

| DNI | Nombre | Plan | Deducible Consumido |
|-----|--------|------|---------------------|
| `1712345678` | Juan García | Plan Básico | $0 / $500 |
| `0998765432` | María López | Plan Básico | $250 / $500 |
| `1798765432` | Carlos Ruiz | Plan Básico | $500 / $500 |
| `1701234567` | Ana Torres | Plan Básico | $100 / $500 |
| `1234567890` | Pedro Vargas | Plan Básico | $0 / $500 |

---

## Roadmap / Mejoras Futuras

- [ ] Integración directa con APIs de aseguradoras (no solo Supabase seed).
- [ ] Agendamiento de citas médicas con hospitales preferidos.
- [ ] Recordatorios de deducibles consumidos y tope OOP restante.
- [ ] Historial de estimaciones por paciente con analytics.
- [ ] Soporte multi-plan y multi-país.
- [ ] Templates de WhatsApp aprobados para notificaciones proactivas.

---

## Equipo

Desarrollado para hackathons y demos de salud digital.

---

## Licencia

MIT
