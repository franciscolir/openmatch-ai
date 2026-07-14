export function generateInsights(session) {
  const insights = [];
  const durationMin = session.durationMs / 60000;
  if (session.possession != null) {
    const dominant = session.possession >= 55 ? "A" : session.possession <= 45 ? "B" : null;
    const text = dominant ? `El Equipo ${dominant} dominó la posesión (${session.possession}% / ${100 - session.possession}%).` : `Posesión equilibrada (${session.possession}% / ${100 - session.possession}%).`;
    insights.push(text);
  }
  if (session.distance > 0) {
    const perMin = durationMin > 0 ? Math.round(session.distance / durationMin) : 0;
    insights.push(`Carga física: ${session.distance.toFixed(0)} m en ${durationMin.toFixed(1)} min (≈${perMin} m/min).`);
  }
  if (session.maxSpeed > 0) {
    insights.push(`Velocidad máxima registrada: ${session.maxSpeed.toFixed(1)} m/s.`);
  }
  const teamTotal = (session.teamDistanceA || 0) + (session.teamDistanceB || 0);
  if (teamTotal > 0) {
    insights.push(`Recorrido por equipo — A: ${Math.round(session.teamDistanceA)} m, B: ${Math.round(session.teamDistanceB)} m.`);
  }
  insights.push(suggestion(session));
  return insights;
}

function suggestion(session) {
  if (session.possession != null && session.possession >= 60) {
    return "Sugerencia: el equipo con menos posesión debería compactar líneas y presionar en bloque medio.";
  }
  if (session.maxSpeed >= 7) {
    return "Sugerencia: las transiciones rápidas son frecuentes; reforzar la recuperación tras pérdida.";
  }
  return "Sugerencia: alternar la intensidad para sostener el ritmo durante todo el partido.";
}
