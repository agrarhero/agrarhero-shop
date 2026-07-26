// Status-Metadaten (Reihenfolge, Anzeige-Label, Farbklasse)
const STATUS = {
  neu:                 { label: 'Neu',                    color: '' },
  geoeffnet:           { label: 'Geöffnet',               color: '' },
  ignoriert:           { label: 'Ignoriert',              color: 'red' },
  berechnet:           { label: 'Rechnung rausgeschickt', color: 'blue' },
  bezahlt:             { label: 'Bezahlt',                color: 'green' },
  versand:             { label: 'Versand',                color: 'orange' },
  versand_verspaetung: { label: 'Versand Verspätung',     color: 'brown' },
  versendet:           { label: 'Versendet',              color: 'yellow' },
  zugestellt:          { label: 'Zugestellt',               color: 'green' },
};
// Kacheln im Dashboard (Schlüssel -> Titel)
const KPIS = [
  ['', 'Gesamt'],
  ['neu', 'Neu'],
  ['geoeffnet', 'Geöffnet'],
  ['ignoriert', 'Ignoriert'],
  ['berechnet', 'Rechnung raus'],
  ['bezahlt', 'Bezahlt'],
  ['versand', 'Versand'],
  ['versand_verspaetung', 'Versand Versp.'],
  ['versendet', 'Versendet'],
  ['zugestellt', 'Zugestellt'],
];
function label(s) { return (STATUS[s] && STATUS[s].label) || s; }
function color(s) { return (STATUS[s] && STATUS[s].color) || ''; }

// Kundensicht: freundliche Labels (+ optionaler Zusatzhinweis)
const CUSTOMER = {
  neu:                 { label: 'In Bearbeitung',     note: '' },
  geoeffnet:           { label: 'In Bearbeitung',     note: '' },
  ignoriert:           { label: 'In Bearbeitung',     note: '' },
  berechnet:           { label: 'Zahlung ausstehend', note: '' },
  bezahlt:             { label: 'Zahlung eingegangen',note: '' },
  versand:             { label: 'Versandvorbereitung',note: '' },
  versand_verspaetung: { label: 'Versandvorbereitung',note: 'leichte Verzögerung – wir haben Sie informiert' },
  versendet:           { label: 'Versendet',          note: '' },
  zugestellt:          { label: 'Zugestellt',         note: '' },
};
function customerLabel(s){ return (CUSTOMER[s] && CUSTOMER[s].label) || 'In Bearbeitung'; }
function customerNote(s){ return (CUSTOMER[s] && CUSTOMER[s].note) || ''; }
function customerColor(s){
  if (s==='versendet'||s==='zugestellt') return 'green';
  if (s==='versand'||s==='versand_verspaetung') return 'orange';
  if (s==='bezahlt') return 'green';
  if (s==='berechnet') return 'blue';
  return 'grey';
}


// Kunden-Statusverlauf (Timeline)
const CUSTOMER_STEPS = ['Bestellung eingegangen', 'Rechnung erhalten', 'Zahlung eingegangen', 'Versandvorbereitung', 'Versendet', 'Zugestellt'];
function customerStep(status) {
  if (status === 'zugestellt') return 5;
  if (status === 'versendet') return 4;
  if (status === 'versand' || status === 'versand_verspaetung') return 3;
  if (status === 'bezahlt') return 2;
  if (status === 'berechnet') return 1;
  return 0;
}

module.exports = { STATUS, KPIS, label, color, CUSTOMER, customerLabel, customerNote, customerColor, CUSTOMER_STEPS, customerStep };
