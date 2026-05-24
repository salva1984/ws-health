function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

/**
 * find-nearest-hospitals
 * Recibe ubicación del usuario, busca hospitales en Supabase,
 * calcula distancias y devuelve lista ordenada por cercanía.
 */

function haversineKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function supabaseQuery(url, apiKey, path, query) {
  const fullUrl = `${url}/rest/v1/${path}?${query}`;
  try {
    const res = await fetchWithTimeout(fullUrl, {
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
      },
    }, 8000);
    if (!res.ok) throw new Error(`Supabase error ${res.status}`);
    return res.json();
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Supabase timeout');
    throw err;
  }
}

function buildStaticMapUrl(key, userLat, userLng, hospitals) {
  if (!key) return null;
  const size = "640x400";
  const userMarker = `markers=color:blue%7Clabel:T%7C${userLat},${userLng}`;
  const hospitalMarkers = hospitals
    .slice(0, 5)
    .map((h, idx) => `markers=color:red%7Clabel:${idx + 1}%7C${h.lat},${h.lng}`)
    .join("&");
  return `https://maps.googleapis.com/maps/api/staticmap?size=${size}&${userMarker}&${hospitalMarkers}&key=${key}`;
}

function googleMapsLink(lat, lng) {
  return `https://maps.google.com/?q=${lat},${lng}`;
}

function extractLocation(vars, lastInbound) {
  // 1. Revisar si ya tenemos coords guardadas
  if (vars.user_lat != null && vars.user_lng != null) {
    return { lat: vars.user_lat, lng: vars.user_lng };
  }

  // 2. Revisar vars.location_input (guardado por wait_location)
  const locInput = vars.location_input;
  if (locInput) {
    if (locInput.latitude != null && locInput.longitude != null) {
      return { lat: parseFloat(locInput.latitude), lng: parseFloat(locInput.longitude) };
    }
    if (locInput.lat != null && locInput.lng != null) {
      return { lat: parseFloat(locInput.lat), lng: parseFloat(locInput.lng) };
    }
    if (typeof locInput === "string") {
      const m = locInput.match(/(-?\d{1,2}\.\d+)[,\s]+(-?\d{1,3}\.\d+)/);
      if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
    }
  }

  // 3. Revisar mensaje entrante de WhatsApp con campos estructurados
  if (lastInbound) {
    if (lastInbound.latitude != null && lastInbound.longitude != null) {
      return { lat: parseFloat(lastInbound.latitude), lng: parseFloat(lastInbound.longitude) };
    }
    if (lastInbound.location?.latitude != null && lastInbound.location?.longitude != null) {
      return { lat: parseFloat(lastInbound.location.latitude), lng: parseFloat(lastInbound.location.longitude) };
    }

    // 4. Parsear del texto del mensaje
    const content = lastInbound.content?.trim() || "";
    const coordMatch = content.match(/(-?\d{1,2}\.\d+)[,\s]+(-?\d{1,3}\.\d+)/);
    if (coordMatch) {
      return { lat: parseFloat(coordMatch[1]), lng: parseFloat(coordMatch[2]) };
    }
  }

  return { lat: null, lng: null };
}

async function handler(request, env) {
  const body = await request.json();
  const vars = body.execution_context?.vars || {};
  const messages = body.whatsapp_context?.messages || [];

  const lastInbound = [...messages].reverse().find((m) => m.direction === "inbound");

  const { lat, lng } = extractLocation(vars, lastInbound);

  if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) {
    const msg = "No pude leer tu ubicación. Inténtalo de nuevo compartiendo desde el clip 📎 → Ubicación.";
    return new Response(
      JSON.stringify({
        vars: {
          ...vars,
          location_text: msg,
          nearest_result: { location_text: msg },
        },
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    const msg = "Error de configuración de base de datos.";
    return new Response(
      JSON.stringify({
        vars: {
          ...vars,
          location_text: msg,
          nearest_result: { location_text: msg },
        },
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const hospitals = await supabaseQuery(supabaseUrl, supabaseKey, "hospital", "select=*");
    const lastEstimate = vars.last_estimate;

    const withDistance = (hospitals || [])
      .filter((h) => h.network_tier !== "OUT_OF_NETWORK")
      .map((h) => {
        const dist = haversineKm({ lat, lng }, { lat: h.lat, lng: h.lng });
        const breakdown = lastEstimate?.ranking?.find((b) => b.hospital.id === h.id);
        return { hospital: h, distance_km: dist, final_copay: breakdown?.final_copay ?? null };
      })
      .sort((a, b) => a.distance_km - b.distance_km)
      .slice(0, 3);

    const header = lastEstimate
      ? `📍 Hospitales más cercanos para *${lastEstimate.specialty.name}*:`
      : "📍 Hospitales más cercanos a tu ubicación:";

    let lines = "";
    withDistance.forEach((r, idx) => {
      const copayPart = r.final_copay !== null ? ` · $${r.final_copay.toFixed(2)}` : "";
      lines += `${idx + 1}. *${r.hospital.name}* — ${r.distance_km.toFixed(1)} km${copayPart}\n   ${googleMapsLink(r.hospital.lat, r.hospital.lng)}\n\n`;
    });

    // Mapa estático opcional
    const mapKey = env.GOOGLE_MAPS_API_KEY;
    let mapText = "";
    if (mapKey) {
      const mapUrl = buildStaticMapUrl(mapKey, lat, lng, withDistance.map((w) => w.hospital));
      if (mapUrl) {
        mapText = `🗺️ Mapa: ${mapUrl}\n\n`;
      }
    }

    // Nota sobre precio vs cercanía
    let note = "";
    if (lastEstimate && withDistance[0]?.final_copay !== null) {
      const cheapest = lastEstimate.ranking?.[0];
      const nearest = withDistance[0];
      if (cheapest && cheapest.hospital.id !== nearest.hospital.id) {
        const diff = (nearest.final_copay - cheapest.final_copay).toFixed(2);
        note = `\n💡 Nota: el más cercano (${nearest.hospital.name}) cuesta $${diff} más que el más económico (${cheapest.hospital.name}). Tu decides 🙂`;
      }
    }

    return new Response(
      JSON.stringify({
        vars: {
          ...vars,
          user_lat: lat,
          user_lng: lng,
          nearest_result: {
            location_text: `${header}\n\n${mapText}${lines}${note}`,
          },
          location_text: `${header}\n\n${mapText}${lines}${note}`,
        },
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("find-nearest-hospitals error:", err);
    const msg = "⚠️ No pude buscar hospitales cercanos en este momento.";
    return new Response(
      JSON.stringify({
        vars: {
          ...vars,
          location_text: msg,
          nearest_result: { location_text: msg },
        },
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }
}

