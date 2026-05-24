function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

/**
 * process-dni
 * Valida DNI, busca afiliado en Supabase y guarda resultado.
 */

const DNI_REGEX = /^\d{8,12}$/;

async function supabaseQuery(url, apiKey, path, query) {
  const fullUrl = `${url}/rest/v1/${path}?${query}`;
  try {
    const res = await fetchWithTimeout(fullUrl, {
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
      },
    }, 8000);
    if (!res.ok) throw new Error(`Supabase error ${res.status}: ${await res.text()}`);
    return res.json();
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Supabase timeout');
    throw err;
  }
}

async function handler(request, env) {
  const body = await request.json();
  const vars = body.execution_context?.vars || {};
  const dniInput = vars.dni_input?.trim() || "";
  const currentAttempts = vars.dni_attempts || 0;

  // Validar formato
  if (!DNI_REGEX.test(dniInput)) {
    const attempts = currentAttempts + 1;
    const nextRoute = attempts >= 2 ? "max_attempts" : "invalid";
    return new Response(
      JSON.stringify({
        vars: { ...vars, dni_attempts: attempts, next_route: nextRoute, error: "Formato de cédula inválido" },
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    const attempts = currentAttempts + 1;
    const nextRoute = attempts >= 2 ? "max_attempts" : "invalid";
    return new Response(
      JSON.stringify({
        vars: { ...vars, dni_attempts: attempts, next_route: nextRoute, error: "Configuración de base de datos incompleta" },
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const affiliates = await supabaseQuery(supabaseUrl, supabaseKey, "affiliate", `dni=eq.${encodeURIComponent(dniInput)}&select=*`);
    const affiliate = affiliates?.[0];

    if (!affiliate) {
      const attempts = currentAttempts + 1;
      const nextRoute = attempts >= 2 ? "max_attempts" : "invalid";
      return new Response(
        JSON.stringify({
          vars: { ...vars, dni_attempts: attempts, next_route: nextRoute, error: "Afiliado no encontrado" },
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    const plans = await supabaseQuery(supabaseUrl, supabaseKey, "insurance_plan", `id=eq.${encodeURIComponent(affiliate.plan_id)}&select=*`);
    const plan = plans?.[0];

    return new Response(
      JSON.stringify({
        vars: {
          ...vars,
          dni: dniInput,
          dni_attempts: 0,
          affiliate,
          plan,
          patient_name: affiliate.full_name,
          plan_name: plan.name,
          deductible_consumed: affiliate.deductible_consumed_ytd,
          deductible_annual: plan.deductible_annual,
          next_route: "valid",
        },
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("process-dni error:", err);
    const attempts = currentAttempts + 1;
    const nextRoute = attempts >= 2 ? "max_attempts" : "invalid";
    return new Response(
      JSON.stringify({
        vars: { ...vars, dni_attempts: attempts, next_route: nextRoute, error: err.message },
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }
}

