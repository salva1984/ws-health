function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function handler(request, env) {
  const body = await request.json();
  const vars = body.execution_context?.vars || {};

  // Contexto de clasificación de síntoma (después de wait_symptom).
  // Si symptom_input está definido (incluso vacío) o si fue un timeout
  // donde no llegó respuesta, debemos devolver empty|normal|emergency.
  const isSymptomContext = vars.symptom_input !== undefined;
  const isLikelyTimeout = !isSymptomContext && vars.affiliate && isWaitingForSymptom(body);

  if (isSymptomContext || isLikelyTimeout) {
    const symptomText = String(vars.symptom_input || "").trim();
    if (symptomText.length < 3) {
      return new Response(
        JSON.stringify({
          vars: {
            ...vars,
            next_route: "empty",
            symptom_result: {
              specialty: "GENERAL", urgency: "LOW",
              reasoning: "¿Sigues ahí? Cuéntame qué síntoma tienes para poder ayudarte.",
              red_flags: [], specialty_name: "Medicina General", red_flags_text: ""
            },
            specialty_name: "Medicina General",
            symptom_reasoning: "¿Sigues ahí? Cuéntame qué síntoma tienes para poder ayudarte.",
            red_flags_text: ""
          }
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }
    return handleClassify(body, vars, env);
  }

  return handleRoute(body, vars, env);
}

function isWaitingForSymptom(body) {
  const messages = body.whatsapp_context?.messages || [];
  if (messages.length === 0) return false;

  // Encontrar el índice del último outbound que pide síntoma
  let lastSymptomOutboundIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (
      messages[i].direction === "outbound" &&
      /síntoma|síntoma tienes|describe con tus palabras/i.test(messages[i].content || "")
    ) {
      lastSymptomOutboundIndex = i;
      break;
    }
  }
  if (lastSymptomOutboundIndex === -1) return false;

  // Verificar si hay algún inbound DESPUÉS de ese outbound
  for (let i = lastSymptomOutboundIndex + 1; i < messages.length; i++) {
    if (messages[i].direction === "inbound") return false; // Hay respuesta nueva
  }

  return true; // No hay respuesta inbound después del pedido de síntoma
}

async function handleRoute(body, vars, env) {
  const messages = body.whatsapp_context?.messages || [];
  const lastInbound = [...messages].reverse().find((m) => m.direction === "inbound");
  const content = lastInbound?.content?.trim() || "";
  const messageType = lastInbound?.message_type;
  const affiliate = vars.affiliate;

  const isLocationMessage = messageType === "location" || /^-?\d{1,2}\.\d+[,\s]+-?\d{1,3}\.\d+$/.test(content);

  if (isLocationMessage) {
    const coordMatch = content.match(/(-?\d{1,2}\.\d+)[,\s]+(-?\d{1,3}\.\d+)/);
    if (coordMatch) {
      vars.user_lat = parseFloat(coordMatch[1]);
      vars.user_lng = parseFloat(coordMatch[2]);
    }
    return new Response(
      JSON.stringify({ vars: { ...vars, next_route: "location" } }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  if (!affiliate) {
    return new Response(
      JSON.stringify({ vars: { ...vars, next_route: "identify" } }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  const history = messages
    .filter((m) => m.message_type === "text")
    .slice(-6)
    .map((m) => ({
      role: m.direction === "inbound" ? "user" : "assistant",
      content: m.content || ""
    }));

  const openRouterKey = env.OPENROUTER_API_KEY;
  let intent = "NEW_ESTIMATE";

  if (openRouterKey) {
    try {
      intent = await classifyIntent(history, openRouterKey);
    } catch (err) {
      console.error("Intent classification failed:", err);
    }
  }

  const route = intent === "GENERAL_CHAT" || intent === "EXPLAIN_LAST" ? "chat" : intent === "LOCATION_NEAREST" ? "location" : "symptom";

  return new Response(
    JSON.stringify({ vars: { ...vars, next_route: route, last_intent: intent } }),
    { headers: { "Content-Type": "application/json" } }
  );
}

async function handleClassify(body, vars, env) {
  const symptomText = vars.symptom_input?.trim() || "";

  if (symptomText.length < 3) {
    return new Response(
      JSON.stringify({
        vars: {
          ...vars, next_route: "empty",
          symptom_result: {
            specialty: "GENERAL", urgency: "LOW",
            reasoning: "Necesito un poco más de detalle sobre tu síntoma.",
            red_flags: [], specialty_name: "Medicina General", red_flags_text: ""
          },
          specialty_name: "Medicina General",
          symptom_reasoning: "Necesito un poco más de detalle sobre tu síntoma.",
          red_flags_text: ""
        }
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  const apiKey = env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({
        vars: {
          ...vars, next_route: "normal",
          symptom_result: {
            specialty: "GENERAL", urgency: "LOW",
            reasoning: "Analizaré tu síntoma con nuestro equipo médico.",
            red_flags: [], specialty_name: "Medicina General", red_flags_text: ""
          },
          specialty_name: "Medicina General",
          symptom_reasoning: "Analizaré tu síntoma con nuestro equipo médico.",
          red_flags_text: ""
        }
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const res = await fetchWithTimeout(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://medicopay.ai",
        "X-Title": "MediCopay"
      },
      body: JSON.stringify({
        model: env.OPENROUTER_MODEL_REASONING || "deepseek/deepseek-r1",
        temperature: 0.1,
        max_tokens: 400,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT_CLASSIFY },
          { role: "user", content: `Síntoma del paciente: "${symptomText}"` }
        ]
      })
    }, 12000);

    if (!res.ok) throw new Error(`OpenRouter error: ${res.status}`);

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content || "{}";
    const result = JSON.parse(raw);

    const SPECIALTY_LABELS = {
      GENERAL: "Medicina General", CARDIOLOGY: "Cardiología", ORTHOPEDICS: "Traumatología",
      PEDIATRICS: "Pediatría", DERMATOLOGY: "Dermatología", GASTRO: "Gastroenterología",
      OPHTHALMOLOGY: "Oftalmología", OTORHINO: "Otorrinolaringología", PSYCHIATRY: "Psiquiatría",
      GYNECOLOGY: "Ginecología", UROLOGY: "Urología", NEUROLOGY: "Neurología",
      ENDOCRINOLOGY: "Endocrinología", PNEUMOLOGY: "Neumología", EMERGENCY: "Emergencias"
    };

    const rawSpecialty = (result.specialty || "GENERAL").toLowerCase().trim();
    const REVERSE_MAP = {
      "medicina general": "GENERAL", cardiología: "CARDIOLOGY", traumatología: "ORTHOPEDICS",
      pediatría: "PEDIATRICS", dermatología: "DERMATOLOGY", gastroenterología: "GASTRO",
      oftalmología: "OPHTHALMOLOGY", otorrinolaringología: "OTORHINO", psiquiatría: "PSYCHIATRY",
      ginecología: "GYNECOLOGY", urología: "UROLOGY", neurología: "NEUROLOGY",
      endocrinología: "ENDOCRINOLOGY", neumología: "PNEUMOLOGY", emergencias: "EMERGENCY",
      emergency: "EMERGENCY", cardiology: "CARDIOLOGY", orthopedics: "ORTHOPEDICS",
      pediatrics: "PEDIATRICS", dermatology: "DERMATOLOGY", gastro: "GASTRO",
      ophthalmology: "OPHTHALMOLOGY", otorhino: "OTORHINO", psychiatry: "PSYCHIATRY",
      gynecology: "GYNECOLOGY", urology: "UROLOGY", neurology: "NEUROLOGY",
      endocrinology: "ENDOCRINOLOGY", pneumology: "PNEUMOLOGY"
    };
    const specialty = REVERSE_MAP[rawSpecialty] || rawSpecialty.toUpperCase();
    const urgency = result.urgency || "LOW";
    const redFlags = Array.isArray(result.red_flags) ? result.red_flags : [];

    // Si el síntoma es médicamente implausible, no alarmar
    if (result.is_plausible === false) {
      const msg = "No estoy seguro de entender bien tu síntoma. ¿Puedes describirme qué te está pasando de verdad? Por ejemplo: dolor de cabeza, fiebre, tos, mareos, etc. Estoy aquí para ayudarte a estimar tu copago.";
      return new Response(
        JSON.stringify({
          vars: {
            ...vars,
            next_route: "normal",
            symptom_result: {
              specialty: "GENERAL", urgency: "LOW",
              reasoning: msg,
              red_flags: [],
              specialty_name: "Medicina General",
              red_flags_text: ""
            },
            specialty_name: "Medicina General",
            symptom_reasoning: msg,
            red_flags_text: ""
          }
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        vars: {
          ...vars,
          next_route: urgency === "EMERGENCY" || specialty === "EMERGENCY" ? "emergency" : "normal",
          symptom_result: {
            specialty, urgency, reasoning: result.reasoning || "",
            red_flags: redFlags,
            specialty_name: SPECIALTY_LABELS[specialty] || specialty,
            red_flags_text: redFlags.length ? `🚨 *Señales de alarma detectadas:* ${redFlags.join(", ")}` : ""
          },
          specialty_name: SPECIALTY_LABELS[specialty] || specialty,
          symptom_reasoning: result.reasoning || "",
          red_flags_text: redFlags.length ? `🚨 *Señales de alarma detectadas:* ${redFlags.join(", ")}` : ""
        }
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("route-message classify error:", err);
    // Si no hay texto de síntoma real (timeout o input vacío), volver a preguntar
    // en vez de asumir normal y caer en un falso positivo de emergencia.
    const fallbackRoute = symptomText.length < 3 ? "empty" : "normal";
    const fallbackMsg =
      symptomText.length < 3
        ? "¿Sigues ahí? Cuéntame qué síntoma tienes para poder ayudarte."
        : "Tuve un problema analizando tu síntoma. Usaré Medicina General.";
    return new Response(
      JSON.stringify({
        vars: {
          ...vars, next_route: fallbackRoute,
          symptom_result: {
            specialty: "GENERAL", urgency: "LOW",
            reasoning: fallbackMsg,
            red_flags: [], specialty_name: "Medicina General", red_flags_text: ""
          },
          specialty_name: "Medicina General",
          symptom_reasoning: fallbackMsg,
          red_flags_text: ""
        }
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }
}

async function classifyIntent(messages, apiKey) {
  try {
    const res = await fetchWithTimeout(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://medicopay.ai",
        "X-Title": "MediCopay"
      },
      body: JSON.stringify({
        model: "deepseek/deepseek-chat",
        temperature: 0.1,
        max_tokens: 20,
        messages: [{ role: "system", content: SYSTEM_PROMPT_ROUTE }, ...messages]
      })
    }, 12000);

    if (!res.ok) throw new Error(`OpenRouter error: ${res.status}`);
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim() || "NEW_ESTIMATE";
    const match = text.match(/(NEW_ESTIMATE|LOCATION_NEAREST|EXPLAIN_LAST|GENERAL_CHAT)/);
    return match ? match[1] : "NEW_ESTIMATE";
  } catch (err) {
    console.error("classifyIntent error:", err);
    return "NEW_ESTIMATE";
  }
}

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const SYSTEM_PROMPT_ROUTE = `Eres un clasificador de intenciones para un asistente médico de cobertura.
Analiza el mensaje del paciente y devuelve UNA sola etiqueta.

Categorías:
  NEW_ESTIMATE: El paciente describe un síntoma, malestar, o quiere cotizar/saber cuánto pagaría por una consulta médica.
  LOCATION_NEAREST: El paciente pregunta por el hospital más cercano, comparte su ubicación, o pide alternativas por distancia.
  EXPLAIN_LAST: El paciente pide explicación o desglose del último cálculo, o no entiende el precio.
  GENERAL_CHAT: Saludos, agradecimientos, preguntas sobre el servicio en general, o preguntas no médicas.

Reglas críticas:
- Si menciona cualquier síntoma o malestar físico/mental → NEW_ESTIMATE.
- Si pide ubicación, distancia o "cerca" → LOCATION_NEAREST.
- En caso de duda → NEW_ESTIMATE.

Devuelve SOLO una etiqueta: NEW_ESTIMATE, LOCATION_NEAREST, EXPLAIN_LAST o GENERAL_CHAT. Nada más.`;

const SYSTEM_PROMPT_CLASSIFY = `Eres un asistente médico de triage. NO diagnosticas, solo orientas hacia la especialidad correcta.

Antes de clasificar, evalúa si el síntoma descrito es médicamente plausible. Si el paciente describe algo físicamente imposible o médicamente absurdo (ej: extremidades extra que aparecen, órganos que crecen/desaparecen repentinamente, cambios anatómicos irreales, sangre de colores imposibles, sensaciones sobrenaturales), responde con:
- is_plausible: false
- specialty: GENERAL
- urgency: LOW
- reasoning: "No estoy seguro de entender bien tu síntoma. ¿Puedes describirme qué te está pasando de verdad? Por ejemplo: dolor de cabeza, fiebre, tos, mareos, etc. Estoy aquí para ayudarte a estimar tu copago."
- red_flags: []

Si el síntoma ES plausible, devuelve:
- is_plausible: true
- specialty: una de [GENERAL, CARDIOLOGY, ORTHOPEDICS, PEDIATRICS, DERMATOLOGY, GASTRO, OPHTHALMOLOGY, OTORHINO, PSYCHIATRY, GYNECOLOGY, UROLOGY, NEUROLOGY, ENDOCRINOLOGY, PNEUMOLOGY, EMERGENCY]
- urgency: una de [LOW, MEDIUM, HIGH, EMERGENCY]
- reasoning: explicación breve en español (1-2 oraciones)
- red_flags: array de strings con síntomas de alarma reales (máx 3)

NUNCA des diagnósticos. NUNCA recetes medicamentos.

Reglas de urgencia:
- EMERGENCY: dolor torácico opresivo, dificultad respiratoria severa, pérdida de conciencia, sangrado masivo, accidente, sospecha de ACV, traumatismo craneal grave, intento de suicidio, dolor abdominal súbito intenso.
- HIGH: fiebre alta persistente >39°C, dolor abdominal moderado-severo, vómito persistente, dolor de pecho leve, lesión que requiere puntos, deshidratación.
- MEDIUM: dolor crónico, lesión menor, infecciones leves, problemas dermatológicos extensos.
- LOW: chequeo, consulta preventiva, dudas, control.

Responde SOLO con el JSON, sin markdown, sin explicaciones adicionales.`;
