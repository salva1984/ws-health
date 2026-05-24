import { START, Workflow } from "@kapso/workflows";

/**
 * MediCopay Kapso Workflow
 * Migrado desde @builderbot/bot a Kapso Workflow.
 *
 * Flujo:
 *  1. Inbound message trigger
 *  2. route-message (detecta ubicación / clasifica intención / chequea affiliate)
 *  3. decide-route → ramas: identify | symptom | estimate | location | chat
 *  4. IDENTIFY: pide DNI → valida → busca en Supabase → guarda vars → pide síntoma
 *  5. SYMPTOM: pide síntoma → classify-symptom (IA) → decide emergency → compute-estimate
 *  6. ESTIMATE: muestra ranking → espera selección → genera PDF → pregunta ubicación
 *  7. LOCATION: pide coordenadas → find-nearest-hospitals → muestra mapa + lista
 *  8. CHAT: agent node conversacional
 *
 * Variables clave del workflow:
 *  - affiliate, plan, dni
 *  - symptom_raw, classification
 *  - last_estimate
 *  - selected_hospital_id, pdf_url
 *  - user_lat, user_lng
 */

const workflow = new Workflow("medicopay", {
  name: "MediCopay",
  status: "active",
});

workflow.addTrigger({
  type: "inbound_message",
  phoneNumberId: "1116152648243594",
});

/* ═══════════════════════════════════════════════════════════════
   SECCIÓN 0 — START & ROUTING
   ═══════════════════════════════════════════════════════════════ */

workflow.addNode(START, { position: { x: 50, y: 350 } });

workflow.addNode("route_message", {
  type: "function",
  functionSlug: "route-message",
  saveResponseTo: "route_result",
}, { position: { x: 200, y: 350 } });

workflow.addEdge(START, "route_message");

workflow.addNode("decide_route", {
  type: "decide",
  decisionType: "function",
  functionSlug: "decide-by-variable",
  conditions: [
    { label: "identify", description: "Usuario nuevo, necesita identificación" },
    { label: "symptom", description: "Preguntar síntoma directamente" },
    { label: "estimate", description: "Recalcular estimación" },
    { label: "location", description: "Buscar hospitales cercanos" },
    { label: "chat", description: "Conversación general" },
  ],
}, { position: { x: 400, y: 350 } });

workflow.addEdge("route_message", "decide_route");

/* ═══════════════════════════════════════════════════════════════
   SECCIÓN 1 — IDENTIFY PATIENT
   ═══════════════════════════════════════════════════════════════ */

workflow.addNode("ask_dni", {
  type: "send_text",
  message:
    "👋 Hola, soy *MediCopay*, tu asistente de cobertura médica.\n\n" +
    "Para estimar tu copago necesito identificarte.\n" +
    "Envíame tu *cédula* (solo números).\n\n" +
    "*DNIs de demo disponibles:*\n" +
    "1712345678, 0998765432, 1798765432, 1701234567, 1234567890",
}, { position: { x: 400, y: 50 } });

workflow.addEdge("decide_route", "ask_dni", { label: "identify" });

workflow.addNode("wait_dni", {
  type: "wait_for_response",
  saveResponseTo: "dni_input",
  timeoutSeconds: 86400,
}, { position: { x: 600, y: 50 } });

workflow.addEdge("ask_dni", "wait_dni");

workflow.addNode("process_dni", {
  type: "function",
  functionSlug: "process-dni",
  saveResponseTo: "dni_result",
}, { position: { x: 800, y: 50 } });

workflow.addEdge("wait_dni", "process_dni");

workflow.addNode("decide_dni", {
  type: "decide",
  decisionType: "function",
  functionSlug: "decide-by-variable",
  conditions: [
    { label: "valid", description: "DNI válido y paciente encontrado" },
    { label: "invalid", description: "DNI inválido o paciente no encontrado" },
    { label: "max_attempts", description: "Demasiados intentos fallidos de DNI" },
  ],
}, { position: { x: 1000, y: 50 } });

workflow.addEdge("process_dni", "decide_dni");

workflow.addNode("dni_error", {
  type: "send_text",
  message:
    "❌ No encontré el afiliado o la cédula es inválida.\n" +
    "Inténtalo de nuevo.\n\n" +
    "*DNIs de demo:* 1712345678, 0998765432, 1798765432, 1701234567, 1234567890",
}, { position: { x: 1000, y: -50 } });

workflow.addEdge("decide_dni", "dni_error", { label: "invalid" });
workflow.addEdge("dni_error", "wait_dni");

workflow.addNode("dni_max_attempts", {
  type: "send_text",
  message:
    "No pude verificar tu identidad después de varios intentos.\n" +
    "Estos son los DNIs de demo disponibles:\n" +
    "1712345678, 0998765432, 1798765432, 1701234567, 1234567890\n\n" +
    "Puedes intentar con uno de esos, o preguntarme lo que necesites y te orientaré con información general.",
}, { position: { x: 1000, y: -150 } });

workflow.addEdge("decide_dni", "dni_max_attempts", { label: "max_attempts" });

workflow.addNode("show_patient_info", {
  type: "send_text",
  message:
    "✅ ¡Hola *{{vars.patient_name}}*!\n" +
    "Plan: *{{vars.plan_name}}*\n" +
    "Deducible consumido: " +
    "${{vars.deductible_consumed}} / " +
    "${{vars.deductible_annual}}\n\n" +
    "Ahora cuéntame, *¿qué síntoma tienes?*",
}, { position: { x: 1200, y: 50 } });

workflow.addEdge("decide_dni", "show_patient_info", { label: "valid" });

/* ═══════════════════════════════════════════════════════════════
   SECCIÓN 2 — SYMPTOM & CLASSIFICATION
   ═══════════════════════════════════════════════════════════════ */

workflow.addNode("ask_symptom", {
  type: "send_text",
  message:
    "🩺 Cuéntame qué síntoma tienes o qué tipo de consulta necesitas. " +
    "Describe con tus palabras.",
}, { position: { x: 1200, y: 200 } });

workflow.addEdge("show_patient_info", "ask_symptom");
workflow.addEdge("decide_route", "ask_symptom", { label: "symptom" });

workflow.addNode("wait_symptom", {
  type: "wait_for_response",
  saveResponseTo: "symptom_input",
  timeoutSeconds: 86400,
}, { position: { x: 1400, y: 200 } });

workflow.addEdge("ask_symptom", "wait_symptom");

workflow.addNode("classify_symptom", {
  type: "function",
  functionSlug: "route-message",
  saveResponseTo: "_symptom_result",
}, { position: { x: 1600, y: 200 } });

workflow.addEdge("wait_symptom", "classify_symptom");

workflow.addNode("decide_emergency", {
  type: "decide",
  decisionType: "function",
  functionSlug: "decide-by-variable",
  conditions: [
    { label: "empty", description: "Input de síntoma vacío, muy corto o timeout" },
    { label: "normal", description: "No es emergencia" },
    { label: "emergency", description: "Es una emergencia médica confirmada por datos" },
  ],
}, { position: { x: 1800, y: 200 } });

workflow.addEdge("classify_symptom", "decide_emergency");

workflow.addNode("emergency_msg", {
  type: "send_text",
  message:
    "🚨 *POSIBLE EMERGENCIA MÉDICA* 🚨\n\n" +
    "{{vars.symptom_reasoning}}\n\n" +
    "{{vars.red_flags_text}}\n\n" +
    "*Acude a urgencias INMEDIATAMENTE* o llama al *911*.\n\n" +
    "_Este asistente no reemplaza atención médica profesional._",
}, { position: { x: 1800, y: 100 } });

workflow.addEdge("decide_emergency", "emergency_msg", { label: "emergency" });

workflow.addNode("send_specialty", {
  type: "send_text",
  message:
    "🔎 Especialidad sugerida: *{{vars.specialty_name}}*\n\n" +
    "_{{vars.symptom_reasoning}}_\n\n" +
    "Voy a calcular tu copago en los hospitales de tu red…",
}, { position: { x: 2000, y: 200 } });

workflow.addEdge("decide_emergency", "send_specialty", { label: "normal" });
workflow.addEdge("decide_emergency", "ask_symptom", { label: "empty" });

/* ═══════════════════════════════════════════════════════════════
   SECCIÓN 3 — ESTIMATE
   ═══════════════════════════════════════════════════════════════ */

workflow.addNode("compute_estimate", {
  type: "function",
  functionSlug: "compute-estimate",
  saveResponseTo: "_estimate_result",
}, { position: { x: 2200, y: 200 } });

workflow.addEdge("send_specialty", "compute_estimate");
workflow.addEdge("decide_route", "compute_estimate", { label: "estimate" });

workflow.addNode("decide_estimate", {
  type: "decide",
  decisionType: "function",
  functionSlug: "decide-by-variable",
  conditions: [
    { label: "has_results", description: "Hay hospitales con tarifa" },
    { label: "empty", description: "No hay hospitales para esta especialidad" },
  ],
}, { position: { x: 2400, y: 200 } });

workflow.addEdge("compute_estimate", "decide_estimate");

workflow.addNode("no_results_msg", {
  type: "send_text",
  message: "No hay hospitales con tarifa registrada para esta especialidad.",
}, { position: { x: 2400, y: 100 } });

workflow.addEdge("decide_estimate", "no_results_msg", { label: "empty" });

workflow.addNode("send_estimate_summary", {
  type: "send_text",
  message: "{{vars.estimate_summary}}",
}, { position: { x: 2600, y: 200 } });

workflow.addEdge("decide_estimate", "send_estimate_summary", { label: "has_results" });

workflow.addNode("send_hospital_list", {
  type: "send_text",
  message:
    "{{vars.hospital_list}}\n\n" +
    "Responde con el *número* del hospital para ver el desglose y recibir tu PDF.",
}, { position: { x: 2800, y: 200 } });

workflow.addEdge("send_estimate_summary", "send_hospital_list");

workflow.addNode("wait_hospital", {
  type: "wait_for_response",
  saveResponseTo: "hospital_input",
  timeoutSeconds: 86400,
}, { position: { x: 3000, y: 200 } });

workflow.addEdge("send_hospital_list", "wait_hospital");

workflow.addNode("process_hospital", {
  type: "function",
  functionSlug: "compute-estimate",
  saveResponseTo: "_hospital_selection_result",
}, { position: { x: 3200, y: 200 } });

workflow.addEdge("wait_hospital", "process_hospital");

workflow.addNode("decide_hospital_valid", {
  type: "decide",
  decisionType: "function",
  functionSlug: "decide-by-variable",
  conditions: [
    { label: "valid", description: "Selección de hospital válida" },
    { label: "invalid", description: "Selección inválida" },
  ],
}, { position: { x: 3400, y: 200 } });

workflow.addEdge("process_hospital", "decide_hospital_valid");

workflow.addNode("hospital_invalid_msg", {
  type: "send_text",
  message:
    "❌ Selección inválida. Por favor responde con el número del hospital de la lista.",
}, { position: { x: 3400, y: 100 } });

workflow.addEdge("decide_hospital_valid", "hospital_invalid_msg", { label: "invalid" });
workflow.addEdge("hospital_invalid_msg", "wait_hospital");

workflow.addNode("send_breakdown", {
  type: "send_text",
  message:
    "{{vars.breakdown_text}}\n\n" +
    "Generando PDF con tu estimación…",
}, { position: { x: 3600, y: 200 } });

workflow.addEdge("decide_hospital_valid", "send_breakdown", { label: "valid" });

workflow.addNode("generate_pdf", {
  type: "function",
  functionSlug: "compute-estimate",
  saveResponseTo: "_pdf_result",
}, { position: { x: 3800, y: 200 } });

workflow.addEdge("send_breakdown", "generate_pdf");

workflow.addNode("send_pdf_link", {
  type: "send_text",
  message: "📄 Tu PDF está listo: {{vars.pdf_url}}",
}, { position: { x: 4000, y: 200 } });

workflow.addEdge("generate_pdf", "send_pdf_link");

workflow.addNode("estimate_done", {
  type: "send_text",
  message:
    "¿Necesitas algo más? Puedes escribirme otro síntoma o preguntarme lo que necesites.\n\n" +
    "Si quieres buscar hospitales cercanos, escribe *ubicación* o envíame tu ubicación por WhatsApp.",
}, { position: { x: 4200, y: 200 } });

workflow.addEdge("send_pdf_link", "estimate_done");

/* ═══════════════════════════════════════════════════════════════
   SECCIÓN 4 — LOCATION (nearest hospitals)
   Ruta independiente: usuario escribe "ubicación" o envía coordenadas
   ═══════════════════════════════════════════════════════════════ */

workflow.addNode("ask_share_location", {
  type: "send_text",
  message:
    "📍 Toca el clip (📎) → *Ubicación* → *Compartir ubicación actual* " +
    "para encontrar el hospital más cercano.\n\n" +
    "(O envíame coordenadas como: -2.15,-79.9)",
}, { position: { x: 4800, y: 200 } });

workflow.addEdge("decide_route", "ask_share_location", { label: "location" });

workflow.addNode("wait_location", {
  type: "wait_for_response",
  saveResponseTo: "location_input",
  timeoutSeconds: 86400,
}, { position: { x: 5000, y: 200 } });

workflow.addEdge("ask_share_location", "wait_location");

workflow.addNode("find_nearest", {
  type: "function",
  functionSlug: "find-nearest-hospitals",
  saveResponseTo: "_nearest_result",
}, { position: { x: 5200, y: 200 } });

workflow.addEdge("wait_location", "find_nearest");

workflow.addNode("send_location_results", {
  type: "send_text",
  message: "{{vars.location_text}}",
}, { position: { x: 5400, y: 200 } });

workflow.addEdge("find_nearest", "send_location_results");

workflow.addNode("location_followup", {
  type: "send_text",
  message:
    "¿Necesitas algo más? Puedes escribirme un síntoma, enviar tu ubicación o preguntarme lo que necesites. Estoy aquí para ayudarte.",
}, { position: { x: 5600, y: 200 } });

workflow.addEdge("send_location_results", "location_followup");

/* ═══════════════════════════════════════════════════════════════
   SECCIÓN 5 — GENERAL CHAT (Agent node)
   ═══════════════════════════════════════════════════════════════ */

workflow.addNode("chat_agent", {
  type: "agent",
  systemPrompt: `Eres MediCopay, un asistente conversacional amable de cobertura médica por WhatsApp.
- Eres conciso (máximo 4 líneas).
- Hablas en español llano y empático.
- Tu trabajo es ayudar al paciente a entender su seguro y cuánto pagaría por una atención antes de ir al hospital.
- NO das diagnósticos ni recetas. Si te preguntan, redirige amablemente.
- Si el paciente parece confundido, sugiere: "describe tu síntoma y te diré cuánto pagarías".
- Si hay una estimación previa (vars.last_estimate), puedes referirte a ella para responder preguntas sobre copagos, hospitales o planes.`,
  providerModel: "gpt-5-mini",
}, { position: { x: 600, y: 550 } });

workflow.addEdge("decide_route", "chat_agent", { label: "chat" });

export default workflow;
