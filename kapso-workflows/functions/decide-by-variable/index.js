/**
 * Decide by variable
 * Lee `vars.next_route` y lo retorna como `next_edge` si está en `available_edges`.
 * Fallback al primer edge disponible.
 */
async function handler(request, env) {
  const body = await request.json();
  const vars = body.execution_context?.vars || {};
  const availableEdges = body.available_edges || [];

  const nextRoute = vars.next_route;
  let nextEdge = availableEdges[0] || "default";

  if (nextRoute && availableEdges.includes(nextRoute)) {
    nextEdge = nextRoute;
  }

  return new Response(
    JSON.stringify({ next_edge: nextEdge }),
    { headers: { "Content-Type": "application/json" } }
  );
}

