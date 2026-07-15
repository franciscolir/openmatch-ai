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
  const events = session.events || [];
  const goals = events.filter((e) => e.type === "goal").length;
  const faults = events.filter((e) => e.type === "fault").length;
  const offsides = events.filter((e) => e.type === "offside").length;
  const chances = events.filter((e) => e.type === "chance").length;
  if (goals > 0) insights.push(`Goles registrados: ${goals}.`);
  if (chances > 0) insights.push(`Ocasiones de gol: ${chances}.`);
  if (faults > 3) insights.push(`Alta cantidad de faltas (${faults}); revisar disciplina defensiva.`);
  if (offsides > 3) insights.push(`${offsides} fueras de juego — la defensa rival usa bien la línea.`);
  if (chances > 0 && goals === 0) insights.push("Múltiples ocasiones sin gol — revisar efectividad de cara al arco.");
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
