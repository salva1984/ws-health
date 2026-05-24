import { START, Workflow } from '@kapso/workflows';

const workflow = new Workflow("medicopay", {
  name: "MediCopay",
  status: "active",
});

workflow.addNode(START, {
  "position": {
    "x": 50,
    "y": 350
  }
});

workflow.addTrigger({
  "active": true,
  "type": "inbound_message",
  "phoneNumberId": "1116152648243594"
});

workflow.addNode("route_message", {
  "config": {
    "function_name": "routemessage",
    "save_response_to": "route_result",
    "function_slug": "route-message"
  },
  "nodeType": "function",
  "type": "raw"
}, {
  "position": {
    "x": 200,
    "y": 350
  },
  "displayName": "Function: routemessage"
});

workflow.addNode("decide_route", {
  "config": {
    "decision_type": "function",
    "conditions": [
      {
        "id": "4d7ae75a-e502-48d3-91fd-ddeadc1c3b6d",
        "label": "identify",
        "description": "Usuario nuevo, necesita identificación"
      },
      {
        "id": "88adee31-6e97-4362-9d53-73b339095694",
        "label": "symptom",
        "description": "Preguntar síntoma directamente"
      },
      {
        "id": "16f34ef2-c3ff-4e87-888a-fceccdb094e5",
        "label": "estimate",
        "description": "Recalcular estimación"
      },
      {
        "id": "4c1d709f-c5a0-499f-8caa-639108ab1e6f",
        "label": "location",
        "description": "Buscar hospitales cercanos"
      },
      {
        "id": "1c4467b9-f291-40bc-86be-cd6d79432eea",
        "label": "chat",
        "description": "Conversación general"
      }
    ],
    "llm_configuration": {},
    "function_name": "Decide by Variable",
    "function_slug": "decide-by-variable"
  },
  "nodeType": "decide",
  "type": "raw"
}, {
  "position": {
    "x": 400,
    "y": 350
  },
  "displayName": "Decision: Function"
});

workflow.addNode("ask_dni", {
  "config": {
    "whatsapp_config_id": null,
    "phone_number_id": null,
    "message": `👋 Hola, soy *MediCopay*, tu asistente de cobertura médica.

Para estimar tu copago necesito identificarte.
Envíame tu *cédula* (solo números).

*DNIs de demo disponibles:*
1712345678, 0998765432, 1798765432, 1701234567, 1234567890`,
    "delay_seconds": 0,
    "provider_model_id": null,
    "provider_model_name": null,
    "ai_field_config": {},
    "to_phone_number": null
  },
  "nodeType": "send_text",
  "type": "raw"
}, {
  "position": {
    "x": 400,
    "y": 50
  },
  "displayName": "Send Text Message"
});

workflow.addNode("wait_dni", {
  "config": {
    "has_timeout": true,
    "timeout_seconds": 300,
    "save_response_to": "dni_input"
  },
  "nodeType": "wait_for_response",
  "type": "raw"
}, {
  "position": {
    "x": 600,
    "y": 50
  },
  "displayName": "Wait for Response (300s timeout)"
});

workflow.addNode("process_dni", {
  "config": {
    "function_name": "Process DNI",
    "save_response_to": "dni_result",
    "function_slug": "process-dni"
  },
  "nodeType": "function",
  "type": "raw"
}, {
  "position": {
    "x": 800,
    "y": 50
  },
  "displayName": "Function: Process DNI"
});

workflow.addNode("decide_dni", {
  "config": {
    "decision_type": "function",
    "conditions": [
      {
        "id": "92f33729-220a-46f7-af02-3c82709a37a1",
        "label": "valid",
        "description": "DNI válido y paciente encontrado"
      },
      {
        "id": "51f9bb16-bcca-4d94-8650-a91e0d92ef83",
        "label": "invalid",
        "description": "DNI inválido o paciente no encontrado"
      },
      {
        "id": "9d8465c3-ecfc-46fb-9b62-bcf335ec1127",
        "label": "max_attempts",
        "description": "Demasiados intentos fallidos de DNI"
      }
    ],
    "llm_configuration": {},
    "function_name": "Decide by Variable",
    "function_slug": "decide-by-variable"
  },
  "nodeType": "decide",
  "type": "raw"
}, {
  "position": {
    "x": 1000,
    "y": 50
  },
  "displayName": "Decision: Function"
});

workflow.addNode("dni_error", {
  "config": {
    "whatsapp_config_id": null,
    "phone_number_id": null,
    "message": `❌ No encontré el afiliado o la cédula es inválida.
Inténtalo de nuevo.

*DNIs de demo:* 1712345678, 0998765432, 1798765432, 1701234567, 1234567890`,
    "delay_seconds": 0,
    "provider_model_id": null,
    "provider_model_name": null,
    "ai_field_config": {},
    "to_phone_number": null
  },
  "nodeType": "send_text",
  "type": "raw"
}, {
  "position": {
    "x": 1000,
    "y": -50
  },
  "displayName": "Send Text Message"
});

workflow.addNode("show_patient_info", {
  "config": {
    "whatsapp_config_id": null,
    "phone_number_id": null,
    "message": `✅ ¡Hola *{{vars.patient_name}}*!
Plan: *{{vars.plan_name}}*
Deducible consumido: \${{vars.deductible_consumed}} / \${{vars.deductible_annual}}

Ahora cuéntame, *¿qué síntoma tienes?*`,
    "delay_seconds": 0,
    "provider_model_id": null,
    "provider_model_name": null,
    "ai_field_config": {},
    "to_phone_number": null
  },
  "nodeType": "send_text",
  "type": "raw"
}, {
  "position": {
    "x": 1200,
    "y": 50
  },
  "displayName": "Send Text Message"
});

workflow.addNode("ask_symptom", {
  "config": {
    "whatsapp_config_id": null,
    "phone_number_id": null,
    "message": "🩺 Cuéntame qué síntoma tienes o qué tipo de consulta necesitas. Describe con tus palabras.",
    "delay_seconds": 0,
    "provider_model_id": null,
    "provider_model_name": null,
    "ai_field_config": {},
    "to_phone_number": null
  },
  "nodeType": "send_text",
  "type": "raw"
}, {
  "position": {
    "x": 1200,
    "y": 200
  },
  "displayName": "Send Text Message"
});

workflow.addNode("wait_symptom", {
  "config": {
    "has_timeout": true,
    "timeout_seconds": 300,
    "save_response_to": "symptom_input"
  },
  "nodeType": "wait_for_response",
  "type": "raw"
}, {
  "position": {
    "x": 1400,
    "y": 200
  },
  "displayName": "Wait for Response (300s timeout)"
});

workflow.addNode("classify_symptom", {
  "config": {
    "function_name": "routemessage",
    "save_response_to": "_symptom_result",
    "function_slug": "route-message"
  },
  "nodeType": "function",
  "type": "raw"
}, {
  "position": {
    "x": 1600,
    "y": 200
  },
  "displayName": "Function: routemessage"
});

workflow.addNode("decide_emergency", {
  "config": {
    "decision_type": "function",
    "conditions": [
      {
        "id": "605b28ea-490d-48e4-b6d8-48d0fcaff43d",
        "label": "emergency",
        "description": "Es una emergencia médica"
      },
      {
        "id": "dd2cb6e1-63f0-4e3a-9717-1aa9c08723c5",
        "label": "normal",
        "description": "No es emergencia"
      }
    ],
    "llm_configuration": {},
    "function_name": "Decide by Variable",
    "function_slug": "decide-by-variable"
  },
  "nodeType": "decide",
  "type": "raw"
}, {
  "position": {
    "x": 1800,
    "y": 200
  },
  "displayName": "Decision: Function"
});

workflow.addNode("emergency_msg", {
  "config": {
    "whatsapp_config_id": null,
    "phone_number_id": null,
    "message": `🚨 *POSIBLE EMERGENCIA MÉDICA* 🚨

{{vars.symptom_reasoning}}

{{vars.red_flags_text}}

*Acude a urgencias INMEDIATAMENTE* o llama al *911*.

_Este asistente no reemplaza atención médica profesional._`,
    "delay_seconds": 0,
    "provider_model_id": null,
    "provider_model_name": null,
    "ai_field_config": {},
    "to_phone_number": null
  },
  "nodeType": "send_text",
  "type": "raw"
}, {
  "position": {
    "x": 1800,
    "y": 100
  },
  "displayName": "Send Text Message"
});

workflow.addNode("send_specialty", {
  "config": {
    "whatsapp_config_id": null,
    "phone_number_id": null,
    "message": `🔎 Especialidad sugerida: *{{vars.specialty_name}}*

_{{vars.symptom_reasoning}}_

Voy a calcular tu copago en los hospitales de tu red…`,
    "delay_seconds": 0,
    "provider_model_id": null,
    "provider_model_name": null,
    "ai_field_config": {},
    "to_phone_number": null
  },
  "nodeType": "send_text",
  "type": "raw"
}, {
  "position": {
    "x": 2000,
    "y": 200
  },
  "displayName": "Send Text Message"
});

workflow.addNode("compute_estimate", {
  "config": {
    "function_name": "Compute Estimate",
    "save_response_to": "_estimate_result",
    "function_slug": "compute-estimate"
  },
  "nodeType": "function",
  "type": "raw"
}, {
  "position": {
    "x": 2200,
    "y": 200
  },
  "displayName": "Function: Compute Estimate"
});

workflow.addNode("decide_estimate", {
  "config": {
    "decision_type": "function",
    "conditions": [
      {
        "id": "e3ef46cc-9dce-4cf2-8601-662e288e6138",
        "label": "has_results",
        "description": "Hay hospitales con tarifa"
      },
      {
        "id": "2f25548a-f7f9-4a82-ae6e-9d0c59148c4c",
        "label": "empty",
        "description": "No hay hospitales para esta especialidad"
      }
    ],
    "llm_configuration": {},
    "function_name": "Decide by Variable",
    "function_slug": "decide-by-variable"
  },
  "nodeType": "decide",
  "type": "raw"
}, {
  "position": {
    "x": 2400,
    "y": 200
  },
  "displayName": "Decision: Function"
});

workflow.addNode("no_results_msg", {
  "config": {
    "whatsapp_config_id": null,
    "phone_number_id": null,
    "message": "No hay hospitales con tarifa registrada para esta especialidad.",
    "delay_seconds": 0,
    "provider_model_id": null,
    "provider_model_name": null,
    "ai_field_config": {},
    "to_phone_number": null
  },
  "nodeType": "send_text",
  "type": "raw"
}, {
  "position": {
    "x": 2400,
    "y": 100
  },
  "displayName": "Send Text Message"
});

workflow.addNode("send_estimate_summary", {
  "config": {
    "whatsapp_config_id": null,
    "phone_number_id": null,
    "message": "{{vars.estimate_summary}}",
    "delay_seconds": 0,
    "provider_model_id": null,
    "provider_model_name": null,
    "ai_field_config": {},
    "to_phone_number": null
  },
  "nodeType": "send_text",
  "type": "raw"
}, {
  "position": {
    "x": 2600,
    "y": 200
  },
  "displayName": "Send Text Message"
});

workflow.addNode("send_hospital_list", {
  "config": {
    "whatsapp_config_id": null,
    "phone_number_id": null,
    "message": `{{vars.hospital_list}}

Responde con el *número* del hospital para ver el desglose y recibir tu PDF.`,
    "delay_seconds": 0,
    "provider_model_id": null,
    "provider_model_name": null,
    "ai_field_config": {},
    "to_phone_number": null
  },
  "nodeType": "send_text",
  "type": "raw"
}, {
  "position": {
    "x": 2800,
    "y": 200
  },
  "displayName": "Send Text Message"
});

workflow.addNode("wait_hospital", {
  "config": {
    "has_timeout": true,
    "timeout_seconds": 300,
    "save_response_to": "hospital_input"
  },
  "nodeType": "wait_for_response",
  "type": "raw"
}, {
  "position": {
    "x": 3000,
    "y": 200
  },
  "displayName": "Wait for Response (300s timeout)"
});

workflow.addNode("process_hospital", {
  "config": {
    "function_name": "Compute Estimate",
    "save_response_to": "_hospital_selection_result",
    "function_slug": "compute-estimate"
  },
  "nodeType": "function",
  "type": "raw"
}, {
  "position": {
    "x": 3200,
    "y": 200
  },
  "displayName": "Function: Compute Estimate"
});

workflow.addNode("decide_hospital_valid", {
  "config": {
    "decision_type": "function",
    "conditions": [
      {
        "id": "ddea0a30-1a42-4cbf-bd6c-715df87e8798",
        "label": "valid",
        "description": "Selección de hospital válida"
      },
      {
        "id": "08296b1a-cc5e-46a7-80f2-77911fda468d",
        "label": "invalid",
        "description": "Selección inválida"
      }
    ],
    "llm_configuration": {},
    "function_name": "Decide by Variable",
    "function_slug": "decide-by-variable"
  },
  "nodeType": "decide",
  "type": "raw"
}, {
  "position": {
    "x": 3400,
    "y": 200
  },
  "displayName": "Decision: Function"
});

workflow.addNode("hospital_invalid_msg", {
  "config": {
    "whatsapp_config_id": null,
    "phone_number_id": null,
    "message": "❌ Selección inválida. Por favor responde con el número del hospital de la lista.",
    "delay_seconds": 0,
    "provider_model_id": null,
    "provider_model_name": null,
    "ai_field_config": {},
    "to_phone_number": null
  },
  "nodeType": "send_text",
  "type": "raw"
}, {
  "position": {
    "x": 3400,
    "y": 100
  },
  "displayName": "Send Text Message"
});

workflow.addNode("send_breakdown", {
  "config": {
    "whatsapp_config_id": null,
    "phone_number_id": null,
    "message": `{{vars.breakdown_text}}

Generando PDF con tu estimación…`,
    "delay_seconds": 0,
    "provider_model_id": null,
    "provider_model_name": null,
    "ai_field_config": {},
    "to_phone_number": null
  },
  "nodeType": "send_text",
  "type": "raw"
}, {
  "position": {
    "x": 3600,
    "y": 200
  },
  "displayName": "Send Text Message"
});

workflow.addNode("generate_pdf", {
  "config": {
    "function_name": "Compute Estimate",
    "save_response_to": "_pdf_result",
    "function_slug": "compute-estimate"
  },
  "nodeType": "function",
  "type": "raw"
}, {
  "position": {
    "x": 3800,
    "y": 200
  },
  "displayName": "Function: Compute Estimate"
});

workflow.addNode("send_pdf_link", {
  "config": {
    "whatsapp_config_id": null,
    "phone_number_id": null,
    "message": "📄 Tu PDF está listo: {{vars.pdf_url}}",
    "delay_seconds": 0,
    "provider_model_id": null,
    "provider_model_name": null,
    "ai_field_config": {},
    "to_phone_number": null
  },
  "nodeType": "send_text",
  "type": "raw"
}, {
  "position": {
    "x": 4000,
    "y": 200
  },
  "displayName": "Send Text Message"
});

workflow.addNode("find_nearest", {
  "config": {
    "function_name": "Find Nearest Hospitals",
    "save_response_to": "_nearest_result",
    "function_slug": "find-nearest-hospitals"
  },
  "nodeType": "function",
  "type": "raw"
}, {
  "position": {
    "x": 5200,
    "y": 200
  },
  "displayName": "Function: Find Nearest Hospitals"
});

workflow.addNode("send_location_results", {
  "config": {
    "whatsapp_config_id": null,
    "phone_number_id": null,
    "message": "{{vars.location_text}}",
    "delay_seconds": 0,
    "provider_model_id": null,
    "provider_model_name": null,
    "ai_field_config": {},
    "to_phone_number": null
  },
  "nodeType": "send_text",
  "type": "raw"
}, {
  "position": {
    "x": 5400,
    "y": 200
  },
  "displayName": "Send Text Message"
});

workflow.addNode("ask_share_location", {
  "config": {
    "whatsapp_config_id": null,
    "phone_number_id": null,
    "message": `📍 Toca el clip (📎) → *Ubicación* → *Compartir ubicación actual* para encontrar el hospital más cercano.

(O envíame coordenadas como: -2.15,-79.9)`,
    "delay_seconds": 0,
    "provider_model_id": null,
    "provider_model_name": null,
    "ai_field_config": {},
    "to_phone_number": null
  },
  "nodeType": "send_text",
  "type": "raw"
}, {
  "position": {
    "x": 4800,
    "y": 200
  },
  "displayName": "Send Text Message"
});

workflow.addNode("wait_location", {
  "config": {
    "has_timeout": true,
    "timeout_seconds": 300,
    "save_response_to": "location_input"
  },
  "nodeType": "wait_for_response",
  "type": "raw"
}, {
  "position": {
    "x": 5000,
    "y": 200
  },
  "displayName": "Wait for Response (300s timeout)"
});

workflow.addNode("chat_agent", {
  "config": {
    "system_prompt": `Eres MediCopay, un asistente conversacional amable de cobertura médica por WhatsApp.
- Eres conciso (máximo 4 líneas).
- Hablas en español llano y empático.
- Tu trabajo es ayudar al paciente a entender su seguro y cuánto pagaría por una atención antes de ir al hospital.
- NO das diagnósticos ni recetas. Si te preguntan, redirige amablemente.
- Si el paciente parece confundido, sugiere: "describe tu síntoma y te diré cuánto pagarías".
- Si hay una estimación previa (vars.last_estimate), puedes referirte a ella para responder preguntas sobre copagos, hospitales o planes.`,
    "provider_model_id": "198e85b6-554d-489b-b552-b405133c9306",
    "provider_model_name": "gpt-5-mini",
    "temperature": "0.0",
    "max_iterations": 80,
    "max_tokens": 8192,
    "reasoning_effort": null,
    "observer_prompt_mode": "analysis_only",
    "enabled_default_tools": [
      "send_notification_to_user",
      "send_media",
      "get_execution_metadata",
      "get_whatsapp_context",
      "get_current_datetime",
      "save_variable",
      "get_variable",
      "ask_about_file",
      "complete_task",
      "handoff_to_human",
      "enter_waiting"
    ],
    "sandbox_enabled": false,
    "sandbox_network_mode": "allow_all",
    "sandbox_allowed_outbound_hosts": [],
    "flow_agent_function_tools": [],
    "flow_agent_app_integration_tools": [],
    "flow_agent_webhooks": [],
    "flow_agent_knowledge_bases": [],
    "flow_agent_mcp_servers": [],
    "flow_agent_resources": []
  },
  "nodeType": "agent",
  "type": "raw"
}, {
  "position": {
    "x": 600,
    "y": 550
  },
  "displayName": "AI Agent"
});

workflow.addNode("location_followup", {
  "config": {
    "whatsapp_config_id": null,
    "phone_number_id": null,
    "message": "¿Necesitas algo más? Puedes escribirme un síntoma, enviar tu ubicación o preguntarme lo que necesites. Estoy aquí para ayudarte.",
    "delay_seconds": 0,
    "provider_model_id": null,
    "provider_model_name": null,
    "ai_field_config": {},
    "to_phone_number": null
  },
  "nodeType": "send_text",
  "type": "raw"
}, {
  "position": {
    "x": 5600,
    "y": 200
  },
  "displayName": "Send Text Message"
});

workflow.addNode("dni_max_attempts", {
  "config": {
    "whatsapp_config_id": null,
    "phone_number_id": null,
    "message": `No pude verificar tu identidad después de varios intentos.
Estos son los DNIs de demo disponibles:
1712345678, 0998765432, 1798765432, 1701234567, 1234567890

Puedes intentar con uno de esos, o preguntarme lo que necesites y te orientaré con información general.`,
    "delay_seconds": 0,
    "provider_model_id": null,
    "provider_model_name": null,
    "ai_field_config": {},
    "to_phone_number": null
  },
  "nodeType": "send_text",
  "type": "raw"
}, {
  "position": {
    "x": 1000,
    "y": -150
  },
  "displayName": "Send Text Message"
});

workflow.addNode("estimate_done", {
  "config": {
    "whatsapp_config_id": null,
    "phone_number_id": null,
    "message": `¿Necesitas algo más? Puedes escribirme otro síntoma o preguntarme lo que necesites.

Si quieres buscar hospitales cercanos, escribe *ubicación* o envíame tu ubicación por WhatsApp.`,
    "delay_seconds": 0,
    "provider_model_id": null,
    "provider_model_name": null,
    "ai_field_config": {},
    "to_phone_number": null
  },
  "nodeType": "send_text",
  "type": "raw"
}, {
  "position": {
    "x": 4200,
    "y": 200
  },
  "displayName": "Send Text Message"
});

workflow.addEdge(START, "route_message");

workflow.addEdge("route_message", "decide_route");

workflow.addEdge("decide_route", "ask_dni", {
  "label": "identify"
});

workflow.addEdge("decide_route", "ask_symptom", {
  "label": "symptom"
});

workflow.addEdge("decide_route", "compute_estimate", {
  "label": "estimate"
});

workflow.addEdge("decide_route", "ask_share_location", {
  "label": "location"
});

workflow.addEdge("decide_route", "chat_agent", {
  "label": "chat"
});

workflow.addEdge("ask_dni", "wait_dni");

workflow.addEdge("wait_dni", "process_dni");

workflow.addEdge("process_dni", "decide_dni");

workflow.addEdge("decide_dni", "dni_max_attempts", {
  "label": "max_attempts"
});

workflow.addEdge("decide_dni", "dni_error", {
  "label": "invalid"
});

workflow.addEdge("decide_dni", "show_patient_info", {
  "label": "valid"
});

workflow.addEdge("dni_error", "wait_dni");

workflow.addEdge("show_patient_info", "ask_symptom");

workflow.addEdge("ask_symptom", "wait_symptom");

workflow.addEdge("wait_symptom", "classify_symptom");

workflow.addEdge("classify_symptom", "decide_emergency");

workflow.addEdge("decide_emergency", "emergency_msg", {
  "label": "emergency"
});

workflow.addEdge("decide_emergency", "send_specialty", {
  "label": "normal"
});

workflow.addEdge("send_specialty", "compute_estimate");

workflow.addEdge("compute_estimate", "decide_estimate");

workflow.addEdge("decide_estimate", "no_results_msg", {
  "label": "empty"
});

workflow.addEdge("decide_estimate", "send_estimate_summary", {
  "label": "has_results"
});

workflow.addEdge("send_estimate_summary", "send_hospital_list");

workflow.addEdge("send_hospital_list", "wait_hospital");

workflow.addEdge("wait_hospital", "process_hospital");

workflow.addEdge("process_hospital", "decide_hospital_valid");

workflow.addEdge("decide_hospital_valid", "hospital_invalid_msg", {
  "label": "invalid"
});

workflow.addEdge("decide_hospital_valid", "send_breakdown", {
  "label": "valid"
});

workflow.addEdge("hospital_invalid_msg", "wait_hospital");

workflow.addEdge("send_breakdown", "generate_pdf");

workflow.addEdge("generate_pdf", "send_pdf_link");

workflow.addEdge("send_pdf_link", "estimate_done");

workflow.addEdge("find_nearest", "send_location_results");

workflow.addEdge("send_location_results", "location_followup");

workflow.addEdge("ask_share_location", "wait_location");

workflow.addEdge("wait_location", "find_nearest");

export default workflow;
