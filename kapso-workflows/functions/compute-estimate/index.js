function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function textToPdf(text) {
  // Minimal PDF 1.4 generator with proper Latin-1 encoding
  
  // Step 1: Normalize characters that are NOT in Windows-1252 (Latin-1)
  const normalized = text
    .replace(/[\u2013\u2014]/g, "-")   // en-dash, em-dash → -
    .replace(/\u2192/g, "->")           // → arrow
    .replace(/[\u2605\u2606]/g, "*")   // ★☆ stars
    .replace(/[\u2713\u2714]/g, "OK")   // ✓✔ checkmarks
    .replace(/\u2022/g, "-")            // bullet
    .replace(/\u2026/g, "...")         // ellipsis
    .replace(/[\u2018\u2019]/g, "'")   // smart single quotes
    .replace(/[\u201C\u201D]/g, '"')    // smart double quotes
    .replace(/\u20AC/g, "EUR")          // euro sign
    .replace(/\u00A0/g, " ");           // non-breaking space
  
  // Step 2: Map Unicode Latin-1 characters to Windows-1252 bytes
  const latin1Map = {
    '\u00C0': 0xC0, '\u00C1': 0xC1, '\u00C2': 0xC2, '\u00C3': 0xC3,
    '\u00C4': 0xC4, '\u00C5': 0xC5, '\u00C6': 0xC6, '\u00C7': 0xC7,
    '\u00C8': 0xC8, '\u00C9': 0xC9, '\u00CA': 0xCA, '\u00CB': 0xCB,
    '\u00CC': 0xCC, '\u00CD': 0xCD, '\u00CE': 0xCE, '\u00CF': 0xCF,
    '\u00D0': 0xD0, '\u00D1': 0xD1, '\u00D2': 0xD2, '\u00D3': 0xD3,
    '\u00D4': 0xD4, '\u00D5': 0xD5, '\u00D6': 0xD6, '\u00D7': 0xD7,
    '\u00D8': 0xD8, '\u00D9': 0xD9, '\u00DA': 0xDA, '\u00DB': 0xDB,
    '\u00DC': 0xDC, '\u00DD': 0xDD, '\u00DE': 0xDE, '\u00DF': 0xDF,
    '\u00E0': 0xE0, '\u00E1': 0xE1, '\u00E2': 0xE2, '\u00E3': 0xE3,
    '\u00E4': 0xE4, '\u00E5': 0xE5, '\u00E6': 0xE6, '\u00E7': 0xE7,
    '\u00E8': 0xE8, '\u00E9': 0xE9, '\u00EA': 0xEA, '\u00EB': 0xEB,
    '\u00EC': 0xEC, '\u00ED': 0xED, '\u00EE': 0xEE, '\u00EF': 0xEF,
    '\u00F0': 0xF0, '\u00F1': 0xF1, '\u00F2': 0xF2, '\u00F3': 0xF3,
    '\u00F4': 0xF4, '\u00F5': 0xF5, '\u00F6': 0xF6, '\u00F7': 0xF7,
    '\u00F8': 0xF8, '\u00F9': 0xF9, '\u00FA': 0xFA, '\u00FB': 0xFB,
    '\u00FC': 0xFC, '\u00FD': 0xFD, '\u00FE': 0xFE, '\u00FF': 0xFF,
    '\u20AC': 0x80, '\u201A': 0x82, '\u0192': 0x83, '\u201E': 0x84,
    '\u2026': 0x85, '\u2020': 0x86, '\u2021': 0x87, '\u02C6': 0x88,
    '\u2030': 0x89, '\u0160': 0x8A, '\u2039': 0x8B, '\u0152': 0x8C,
    '\u017D': 0x8E, '\u2018': 0x91, '\u2019': 0x92, '\u201C': 0x93,
    '\u201D': 0x94, '\u2022': 0x95, '\u2013': 0x96, '\u2014': 0x97,
    '\u02DC': 0x98, '\u2122': 0x99, '\u0161': 0x9A, '\u203A': 0x9B,
    '\u0153': 0x9C, '\u017E': 0x9E, '\u0178': 0x9F,
  };
  
  function toLatin1(str) {
    const bytes = [];
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      const code = ch.charCodeAt(0);
      if (code <= 0x7F) {
        bytes.push(code);  // ASCII as-is
      } else if (code <= 0xFF) {
        bytes.push(code);  // Latin-1 direct mapping
      } else {
        const mapped = latin1Map[ch];
        if (mapped !== undefined) {
          bytes.push(mapped);
        } else {
          bytes.push(0x3F);  // ? for unknown chars
        }
      }
    }
    return new Uint8Array(bytes);
  }
  
  function escapePdf(str) {
    // Escape PDF string metacharacters: \ ( ) \r \n
    return str
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)")
      .replace(/\r/g, "\\r")
      .replace(/\n/g, "\\n");
  }
  
  const lines = normalized.split("\n");
  let contentOps = [];
  
  contentOps.push("BT");
  contentOps.push("/F1 10 Tf");
  contentOps.push("72 700 Td");
  
  let firstLine = true;
  for (const line of lines) {
    if (line.trim() === "") {
      if (!firstLine) contentOps.push("0 -14 Td");
      firstLine = false;
      continue;
    }
    if (!firstLine) {
      contentOps.push("0 -14 Td");
    }
    firstLine = false;
    contentOps.push(`(${escapePdf(line)}) Tj`);
  }
  
  contentOps.push("ET");
  
  // Encode the content stream to Latin-1 bytes
  const contentStream = contentOps.join("\n");
  const contentBytes = toLatin1(contentStream);
  
  function strToBytes(s) { return new TextEncoder().encode(s); }
  
  const parts = [];
  let currentOffset = 0;
  const offsets = [];
  
  // Header
  const header = strToBytes("%PDF-1.4\n");
  parts.push(header);
  currentOffset += header.length;
  
  // Object 1: Catalog
  const obj1 = strToBytes("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  offsets.push(currentOffset);
  parts.push(obj1);
  currentOffset += obj1.length;
  
  // Object 2: Pages
  const obj2 = strToBytes("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  offsets.push(currentOffset);
  parts.push(obj2);
  currentOffset += obj2.length;
  
  // Object 3: Page
  const obj3 = strToBytes("3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n");
  offsets.push(currentOffset);
  parts.push(obj3);
  currentOffset += obj3.length;
  
  // Object 4: Content stream
  const obj4Header = strToBytes(`4 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n`);
  const obj4Footer = strToBytes("\nendstream\nendobj\n");
  offsets.push(currentOffset);
  parts.push(obj4Header);
  parts.push(contentBytes);
  parts.push(obj4Footer);
  currentOffset += obj4Header.length + contentBytes.length + obj4Footer.length;
  
  // Object 5: Font
  const obj5 = strToBytes("5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n");
  offsets.push(currentOffset);
  parts.push(obj5);
  currentOffset += obj5.length;
  
  // xref
  const xrefOffset = currentOffset;
  let xrefStr = "xref\n0 6\n0000000000 65535 f \n";
  for (const off of offsets) {
    xrefStr += String(off).padStart(10, "0") + " 00000 n \n";
  }
  const xref = strToBytes(xrefStr);
  parts.push(xref);
  currentOffset += xref.length;
  
  // trailer
  const trailer = strToBytes(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  parts.push(trailer);
  
  // Concatenate all parts
  const totalSize = parts.reduce((sum, p) => sum + p.length, 0);
  const pdf = new Uint8Array(totalSize);
  let pos = 0;
  for (const part of parts) {
    pdf.set(part, pos);
    pos += part.length;
  }
  
  return pdf;
}

async function handler(request, env) {
  const body = await request.json();
  const vars = body.execution_context?.vars || {};

  if (vars.hospital_selection_result?.breakdown) {
    return handlePdf(body, vars, env);
  }
  if (vars.hospital_input && vars.last_estimate) {
    return handleSelect(body, vars, env);
  }
  return handleEstimate(body, vars, env);
}

function computeBreakdown(hospital, plan, affiliate) {
  const isPreferred = hospital.network_tier === "PREFERRED";
  const tierMultiplier = isPreferred ? (plan.preferred_multiplier || 1) : 1;
  const tier_adjusted_price = round2(hospital.base_price * tierMultiplier);
  const deductible_remaining = Math.max(0, round2(plan.deductible_annual - affiliate.deductible_consumed_ytd));
  const deductible_applied = Math.min(deductible_remaining, tier_adjusted_price);
  const after_deductible = round2(tier_adjusted_price - deductible_applied);
  const coinsurance_amount = round2(after_deductible * (plan.coinsurance_pct || 0));
  const copay_raw = round2(deductible_applied + coinsurance_amount + (plan.copay_fixed || 0));
  const oop_remaining = Math.max(0, round2(plan.oop_max_annual - affiliate.oop_consumed_ytd));
  const final_copay = Math.min(copay_raw, oop_remaining);
  return {
    hospital, base_price: hospital.base_price, tier_adjusted_price,
    deductible_applied, coinsurance_amount, fixed_copay: plan.copay_fixed || 0,
    oop_cap_applied: copay_raw > oop_remaining, final_copay: round2(final_copay),
    network_tier: hospital.network_tier
  };
}

async function supabaseQuery(url, apiKey, path, query) {
  const fullUrl = `${url}/rest/v1/${path}?${query}`;
  try {
    const res = await fetchWithTimeout(fullUrl, {
      headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}` }
    }, 8000);
    if (!res.ok) throw new Error(`Supabase error ${res.status}`);
    return res.json();
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Supabase timeout');
    throw err;
  }
}

async function handleEstimate(body, vars, env) {
  const dni = vars.dni;
  const specialty = vars.symptom_result?.specialty;

  if (!dni || !specialty) {
    return new Response(
      JSON.stringify({ vars: { ...vars, next_route: "empty", estimate_result: { has_results: false } } }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return new Response(
      JSON.stringify({ vars: { ...vars, next_route: "empty", error: "Falta configuración de Supabase" } }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    let affiliate = vars.affiliate;
    let plan = vars.plan;

    if (!affiliate) {
      const affiliates = await supabaseQuery(supabaseUrl, supabaseKey, "affiliate", `dni=eq.${encodeURIComponent(dni)}&select=*`);
      affiliate = affiliates?.[0];
    }
    if (!affiliate) {
      return new Response(
        JSON.stringify({ vars: { ...vars, next_route: "empty", error: "Afiliado no encontrado" } }),
        { headers: { "Content-Type": "application/json" } }
      );
    }
    if (!plan) {
      const plans = await supabaseQuery(supabaseUrl, supabaseKey, "insurance_plan", `id=eq.${encodeURIComponent(affiliate.plan_id)}&select=*`);
      plan = plans?.[0];
    }

    const specialties = await supabaseQuery(supabaseUrl, supabaseKey, "specialty", `id=eq.${encodeURIComponent(specialty)}&select=*`);
    const specialtyObj = specialties?.[0] || { id: specialty, name: specialty };

    const tariffRows = await supabaseQuery(
      supabaseUrl, supabaseKey, "hospital_tariff",
      `specialty_id=eq.${encodeURIComponent(specialty)}&select=base_price,hospital:hospital_id(*)`
    );

    const hospitalsWithTariff = (tariffRows || [])
      .filter((r) => r.hospital && r.hospital.network_tier !== "OUT_OF_NETWORK")
      .map((r) => ({ ...r.hospital, base_price: Number(r.base_price) }));

    const ranking = hospitalsWithTariff
      .map((h) => computeBreakdown(h, plan, affiliate))
      .sort((a, b) => a.final_copay - b.final_copay);

    if (ranking.length === 0) {
      return new Response(
        JSON.stringify({ vars: { ...vars, next_route: "empty", estimate_result: { has_results: false } } }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    const cheapest = ranking[0];
    const mostExpensive = ranking[ranking.length - 1];
    const savings = round2(mostExpensive.final_copay - cheapest.final_copay);
    const TIER_BADGE = { PREFERRED: "⭐ Preferido", STANDARD: "✓ Red" };

    let summaryText =
      `💰 *Estimación de copago — ${specialtyObj.name}*\n` +
      `Plan: *${plan.name}*\n\n` +
      `Ordené ${ranking.length} hospitales por lo que pagarías de tu bolsillo:\n` +
      `🥇 Más económico: *$${cheapest.final_copay.toFixed(2)}* en ${cheapest.hospital.name}\n` +
      `🔝 Más caro: $${mostExpensive.final_copay.toFixed(2)} en ${mostExpensive.hospital.name}\n`;
    if (savings > 0) {
      summaryText += `💡 *Ahorras hasta $${savings.toFixed(2)}* eligiendo el más conveniente.\n\n`;
    } else {
      summaryText += `\n`;
    }
    summaryText += `Responde con el *número* del hospital para ver el desglose y recibir tu PDF:`;

    let hospitalListText = "";
    ranking.slice(0, 10).forEach((b, idx) => {
      hospitalListText += `${idx + 1}. *${b.hospital.name}* — $${b.final_copay.toFixed(2)} ${TIER_BADGE[b.network_tier] || ""}\n`;
    });

    return new Response(
      JSON.stringify({
        vars: {
          ...vars, affiliate, plan, next_route: "has_results",
          last_estimate: { affiliate, plan, specialty: specialtyObj, ranking },
          estimate_result: { has_results: true, summary_text: summaryText, hospital_list_text: hospitalListText },
          estimate_summary: summaryText, hospital_list: hospitalListText
        }
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("compute-estimate error:", err);
    return new Response(
      JSON.stringify({ vars: { ...vars, next_route: "empty", error: err.message } }),
      { headers: { "Content-Type": "application/json" } }
    );
  }
}

async function handleSelect(body, vars, env) {
  const input = vars.hospital_input?.trim() || "";
  const estimate = vars.last_estimate;

  if (!estimate || !estimate.ranking || estimate.ranking.length === 0) {
    return new Response(
      JSON.stringify({ vars: { ...vars, next_route: "invalid", error: "No hay estimación disponible" } }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  let selectedIndex = -1;
  const numMatch = input.match(/^(\d+)$/);
  if (numMatch) selectedIndex = parseInt(numMatch[1], 10) - 1;
  const hospMatch = input.match(/^hosp-(.+)$/i);
  if (hospMatch && selectedIndex < 0) selectedIndex = estimate.ranking.findIndex((b) => b.hospital.id === hospMatch[1]);

  if (selectedIndex < 0 || selectedIndex >= estimate.ranking.length) {
    return new Response(
      JSON.stringify({ vars: { ...vars, next_route: "invalid", error: "Hospital no encontrado en la lista" } }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  const breakdown = estimate.ranking[selectedIndex];

  let text =
    `🧾 *Desglose — ${breakdown.hospital.name}*\n` +
    `📍 ${breakdown.hospital.address || ""}\n` +
    `Especialidad: ${estimate.specialty.name}\n\n` +
    `Tarifa lista: $${breakdown.base_price.toFixed(2)}\n`;
  if (breakdown.network_tier === "PREFERRED") text += `Ajuste por tier preferido: $${breakdown.tier_adjusted_price.toFixed(2)}\n`;
  text +=
    `Deducible aplicado: $${breakdown.deductible_applied.toFixed(2)}\n` +
    `Coaseguro: $${breakdown.coinsurance_amount.toFixed(2)}\n` +
    `Copago fijo: $${breakdown.fixed_copay.toFixed(2)}\n`;
  if (breakdown.oop_cap_applied) text += `🎯 *¡Tope OOP anual alcanzado!* Tu plan cubre lo demás.\n`;
  text += `\n*Lo que pagas tú: $${breakdown.final_copay.toFixed(2)}*`;

  return new Response(
    JSON.stringify({
      vars: {
        ...vars, next_route: "valid",
        selected_hospital_index: selectedIndex, selected_hospital_id: breakdown.hospital.id,
        hospital_selection_result: { breakdown_text: text, breakdown },
        breakdown_text: text
      }
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}

async function handlePdf(body, vars, env) {
  const estimate = vars.last_estimate;
  const selection = vars.hospital_selection_result?.breakdown;

  if (!estimate || !selection) {
    return new Response(
      JSON.stringify({ vars: { ...vars, pdf_result: { url: "" } } }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_KEY;
  const bucket = env.SUPABASE_STORAGE_BUCKET || "estimates";
  if (!supabaseUrl || !supabaseKey) {
    return new Response(
      JSON.stringify({ vars: { ...vars, pdf_result: { url: "" } } }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const text = "MediCopay — Estimación de copago\n" +
      "==============================\n\n" +
      `Paciente: ${estimate.affiliate.full_name}\n` +
      `Cédula: ${estimate.affiliate.dni}\n` +
      `Plan: ${estimate.plan.name}\n` +
      `Fecha: ${new Date().toLocaleDateString("es-EC")}\n\n` +
      "Atención seleccionada\n---------------------\n" +
      `Especialidad: ${estimate.specialty.name}\n` +
      `Hospital: ${selection.hospital.name}\n` +
      `Tier de red: ${selection.network_tier}\n` +
      (selection.hospital.address ? `Dirección: ${selection.hospital.address}\n` : "") + "\n" +
      "Desglose del cálculo\n---------------------\n" +
      `Tarifa lista del hospital: $${selection.base_price.toFixed(2)}\n` +
      (selection.network_tier === "PREFERRED" ? `Ajuste por tier preferido: $${selection.tier_adjusted_price.toFixed(2)}\n` : "") +
      `Deducible aplicado: $${selection.deductible_applied.toFixed(2)}\n` +
      (selection.coinsurance_amount > 0
        ? `Coaseguro (${(estimate.plan.coinsurance_pct * 100).toFixed(0)}%): $${selection.coinsurance_amount.toFixed(2)}\n`
        : `Coaseguro (${(estimate.plan.coinsurance_pct * 100).toFixed(0)}%): $0.00 (el deducible cubrió toda la tarifa)\n`) +
      `Copago fijo del plan: $${selection.fixed_copay.toFixed(2)}\n` +
      (selection.oop_cap_applied ? "★ Tope OOP anual alcanzado. El plan cubre el resto.\n" : "") + "\n" +
      `Total que pagas: $${selection.final_copay.toFixed(2)}\n\n` +
      "Comparativa de la red\n---------------------\n" +
      estimate.ranking.map((b) => {
        const marker = b.hospital.id === selection.hospital.id ? "→ " : "  ";
        return `${marker}${b.hospital.name} — $${b.final_copay.toFixed(2)}`;
      }).join("\n") + "\n\n---\n" +
      "Esta estimación es referencial. MediCopay no realiza diagnósticos médicos.\n";

    const pdfBytes = textToPdf(text);
    const filename = `estimate-${estimate.affiliate.dni}-${Date.now()}.pdf`;
    const uploadUrl = `${supabaseUrl}/storage/v1/object/${bucket}/${filename}`;

    const uploadRes = await fetchWithTimeout(uploadUrl, {
      method: "POST",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/pdf",
        "x-upsert": "true"
      },
      body: pdfBytes
    }, 10000);

    if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`);

    const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${filename}`;

    try {
      await fetchWithTimeout(`${supabaseUrl}/rest/v1/estimate_log`, {
        method: "POST",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal"
        },
        body: JSON.stringify({
          dni: estimate.affiliate.dni,
          phone: vars.context?.phone_number || null,
          symptom_raw: vars.symptom_input || "",
          specialty_id: estimate.specialty.id,
          hospital_id: selection.hospital.id,
          base_price: selection.base_price,
          final_copay: selection.final_copay,
          pdf_url: publicUrl
        })
      }, 5000);
    } catch (logErr) {
      console.error("Log estimate error:", logErr);
    }

    return new Response(
      JSON.stringify({ vars: { ...vars, pdf_result: { url: publicUrl }, pdf_url: publicUrl } }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("compute-estimate pdf error:", err);
    return new Response(
      JSON.stringify({ vars: { ...vars, pdf_result: { url: "", error: err.message } } }),
      { headers: { "Content-Type": "application/json" } }
    );
  }
}
