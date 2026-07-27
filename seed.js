const db = require('./db');
const reset = process.argv.includes('--reset');

// Beispiel-Sortiment Agrarhero. Preise netto (zzgl. 19 % MwSt).
// Hinweis: Platzhalter-Produkte zum Testen. Echte Daten/Bilder folgen.
const PRODUCTS = [
  // ============ Seilwinden ============
  { slug:'tajfun-egv-85-ahk-sg', name:'TAJFUN Forstseilwinde EGV 85 AHK SG + TERRA Funk', type:'hydraulisch · Funksteuerung TERRA', category:'forstseilwinde', group:'seilwinde', bestseller:1, min_order:1, max_order:10,
    dimensions:'Schildbreite 2,05 m · Dreipunkt Kat. II', load_capacity:'Zugkraft 8,5 t (85 kN)', baujahr:'2026',
    short_desc:'Hydraulische TAJFUN Profi-Forstseilwinde mit 8,5 t Zugkraft, Funksteuerung TERRA und automatischem Seilausstoß. Fabrikneu mit 24 Monaten Garantie.',
    description:'Die TAJFUN Forstseilwinde EGV 85 AHK SG ist eine hydraulisch betätigte Profi-Seilwinde für den anspruchsvollen Dauereinsatz im Wald. Mit 8,5 t (85 kN) Zugkraft zieht sie auch schweres Stammholz sicher zur Rückegasse und passt zu Traktoren im mittleren bis oberen Leistungsbereich. Die Kraft überträgt eine im Ölbad laufende Lamellenkupplung mit automatischer Lamellenbremse, die ein feinfühliges Anziehen und ein sofortiges, sicheres Halten der Last ermöglicht. Serienmäßig arbeitet die Winde mit der Funksteuerung TERRA, sodass Sie das Holz aus sicherer Entfernung und mit voller Übersicht rücken. Der automatische Seilausstoß mit Niederhalter (SG) legt das Seil sauber aus und beschleunigt jeden Arbeitsgang spürbar. Das breite, klappbare Rückeschild von 2,05 m sorgt für einen stabilen Stand, auch am Hang, und schützt den Traktor. Der Anbau erfolgt über den Dreipunkt Kat. II, die Seiltrommel fasst 70 m Seil (11 mm). Robuste Bauweise, hochwertiges TAJFUN Getriebe und ein durchdachter Schutzaufbau machen dieses Gerät zu einer langlebigen Investition für Landwirte, Forstbetriebe und Lohnunternehmer. Die Winde wird fabrikneu und geliefert auf Palette. Auf dieses Gerät gewähren wir 24 Monate Garantie.',
    features:['Zugkraft 8,5 t (85 kN)','Hydraulische Betätigung','Funksteuerung TERRA inklusive','Automatischer Seilausstoß mit Niederhalter (SG)','Lamellenkupplung im Ölbad mit automatischer Bremse','Klappbares Rückeschild, 2,05 m breit','Dreipunktanbau Kat. II','Seiltrommel für 70 m Seil (11 mm)','Fabrikneu, Lieferung auf Palette','24 Monate Garantie'],
    price_cents:675000, compare_cents:null, image:'tajfun-egv-85-ahk-sg.jpg',
    gallery:['tajfun-egv-85-ahk-sg-2.jpg','tajfun-egv-85-ahk-sg-3.jpg','tajfun-egv-85-ahk-sg-4.jpg','tajfun-egv-85-ahk-sg-5.jpg'],
    sort_order:5 },

  { slug:'uniforest-65-h-pro', name:'UNIFOREST Forstseilwinde 65 H Pro + TERRA Funk', type:'hydraulisch · Funksteuerung TERRA', category:'forstseilwinde', group:'seilwinde', bestseller:0, min_order:1, max_order:10,
    dimensions:'Schildbreite 1,8 m · Dreipunkt KAT II', load_capacity:'Zugkraft 6,5 t (64 kN)', baujahr:'07/2025',
    short_desc:'Hydraulische UNIFOREST Dreipunktseilwinde 65 H Pro (Bayern-Edition) mit 6,5 t Zugkraft, TERRA Funk und Seilausstoß mit Seilendabschaltung. Fabrikneu mit 24 Monaten Garantie.',
    description:'Die UNIFOREST Dreipunktseilwinde 65 H Pro in der Bayern-Edition ist eine hydraulisch betätigte Forstseilwinde für den professionellen Einsatz. Sie bringt 6,5 t (64 kN) Zugkraft auf das Seil und wird über den Dreipunkt in Kategorie II angebaut. Bedient wird die Winde bequem und sicher per TERRA Funk D1 Funkfernbedienung aus der Distanz. Der automatische Seilausstoß mit Seilendabschaltung sorgt für zügiges, komfortables Arbeiten und schützt das Seil zuverlässig. Serienmäßig sind eine Seiltrommel für 90 m Seil bei 11 mm Seildurchmesser, ein breites Rückeschild mit 1,8 m (1800 mm) Breite sowie eine Eigenölversorgung an Bord, die passende Gelenkwelle ist im Lieferumfang enthalten. Die Winde ist eine Neumaschine, Baujahr 07/2025, und wird fabrikneu geliefert. Auf dieses Gerät gewähren wir 24 Monate Garantie.',
    features:['Sondermodell Bayern-Edition','Zugkraft 6,5 t (64 kN)','Hydraulische Betätigung','Funkfernbedienung TERRA Funk D1','Automatischer Seilausstoß mit Seilendabschaltung','Dreipunktanbau KAT II','Seildurchmesser 11 mm · Seillänge 90 m','Rückeschild 1,8 m (1800 mm) breit','Eigenölversorgung','Inkl. Gelenkwelle','Neumaschine, Baujahr 07/2025','24 Monate Garantie'],
    price_cents:395000, compare_cents:null, image:'uniforest-65-h-pro.jpg',
    gallery:['uniforest-65-h-pro-2.jpg','uniforest-65-h-pro-3.jpg','uniforest-65-h-pro-4.jpg'],
    sort_order:6 },

  { slug:'krpan-55-eh', name:'KRPAN Forstseilwinde 5,5 EH + TERRA Funk', type:'elektrohydraulisch · Funksteuerung TERRA', category:'forstseilwinde', group:'seilwinde', bestseller:0, min_order:1, max_order:10,
    dimensions:'Schildbreite 150 cm · Dreipunkt Kat. I/II', load_capacity:'Zugkraft 5,5 t (55 kN)', baujahr:'2023',
    short_desc:'Elektrohydraulische KRPAN Forstseilwinde 5,5 EH mit 5,5 t Zugkraft, TERRA Funk und hydraulischem Seilausstoß. Fabrikneu mit 24 Monaten Garantie.',
    description:'Die KRPAN 5,5 EH ist eine kompakte, elektrohydraulisch bediente Forstseilwinde mit 5,5 t (55 kN) Zugkraft für den vielseitigen Einsatz im Wald. Über die elektrohydraulische Bedienung und die inkludierte TERRA Funkfernbedienung steuern Sie das Rücken bequem und sicher aus der Distanz. Der hydraulische Seilausstoß mit Endschalter legt das Seil sauber aus und stoppt zuverlässig am Anschlag. Serienmäßig ist die Winde mit 100 m hochverdichtetem 10-mm-Spezialforstseil, drehbarem Seilendstück, unterer Umlenkrolle (Seileinlaufrolle unten), abnehmbarer Anhängekupplung und klappbarem Schutzgitter ausgestattet. Das robuste Rückeschild ist 150 cm breit (optional 170 cm gegen Aufpreis erhältlich), die Öffnungsweite beträgt 152 cm. Angebaut wird die Winde über den Dreipunkt (Kat. I/II). Sie ist eine Neumaschine, Baujahr 2023, und wird fabrikneu geliefert. Auf dieses Gerät gewähren wir 24 Monate Garantie.',
    features:['Zugkraft 5,5 t (55 kN)','Elektrohydraulische Bedienung','Funkfernbedienung TERRA inklusive','Hydraulischer Seilausstoß mit Endschalter','100 m hochverdichtetes 10-mm-Spezialforstseil','Drehbares Seilendstück','Untere Umlenkrolle (Seileinlaufrolle unten)','Abnehmbare Anhängekupplung','Klappbares Schutzgitter','Rückeschild 150 cm (170 cm optional) · Öffnungsweite 152 cm','Dreipunktanbau Kat. I/II','Neumaschine, Baujahr 2023','24 Monate Garantie'],
    price_cents:385000, compare_cents:null, image:'krpan-55-eh.jpg',
    gallery:['krpan-55-eh-2.jpg','krpan-55-eh-3.jpg','krpan-55-eh-4.jpg','krpan-55-eh-5.jpg'],
    sort_order:7 },

  // ============ Güllefässer / Wasserwagen ============
  { slug:'fliegl-wfw-4000', name:'FLIEGL WFW 4000 Einachs-Wasserfasswagen (4.000 Liter)', type:'Einachser · 4.000 Liter · verzinkt', category:'wasserfass', group:'guellefass', bestseller:0, min_order:1, max_order:5,
    dimensions:'Einachser · zul. Gesamtgewicht 5.000 kg · 40 km/h', load_capacity:'Fassungsvermögen 4.000 Liter', baujahr:'2024',
    short_desc:'Verzinkter FLIEGL Einachs-Wasserfasswagen WFW 4000 mit 4.000 Litern, Kreiselpumpe, Schlauchhaspel und Breitverteiler. Ideal für Wasser, Abwasser und Flüssigkeiten. Fabrikneu.',
    description:'Der FLIEGL WFW 4000 ist ein verzinkter Einachs-Wasserfasswagen mit 4.000 Litern Fassungsvermögen, ideal für den Transport und das Ausbringen von Wasser, Abwasser und anderen Flüssigkeiten. Der Behälter ist in robuster, feuerverzinkter Stahlausführung gefertigt und sitzt auf einem durchgehend starken Winkelrahmen mit Einachsfahrwerk. Das zulässige Gesamtgewicht beträgt 5.000 kg (4.000 kg Achslast zzgl. 1.000 kg Stützlast). In der 40-km/h-Ausführung mit Auflaufbremse und 15.0/70-18-Bereifung (16 PR) liegen TÜV-/DEKRA-Papiere vor. Für Förderung und Ausbringung sorgen ein Kompressor (5.000 l) und eine Kreiselpumpe (3.500 l, max. 540 U/min) mit einseitiger Weitwinkel-Gelenkwelle. Umfangreich ausgestattet ist der Wagen unter anderem mit Füllstandsanzeiger, Mannloch (Ø 600 mm) hinten, Zusatzsiphon, Zweiflansch-Plattenschieber (5" V-Teil), Befüllrohr für Hydrantenbefüllung (B-Anschluss), Schlauchhaspel (1½" × 20 m mit Industrieschlauch NW 38 und Mehrzweckstrahlrohr bis 8 bar), Breitverteiler sowie Beleuchtung und Warntafeln. Verstellbare Zugdeichsel mit Obenanhängung und DIN-Zugöse 40 mm, schweres klappbares Stützrad. Fabrikneu, Baujahr 2024. Auf Behälter und Rahmen gewähren wir 24 Monate Garantie.',
    features:['Fassungsvermögen 4.000 Liter','Verzinkter Stahlbehälter','Einachs-Fahrgestell · zul. GG 5.000 kg','40 km/h Ausführung mit TÜV-/DEKRA-Papieren','Auflaufbremse · Bereifung 15.0/70-18 16 PR','Kompressor 5.000 l · Kreiselpumpe 3.500 l (540 U/min)','Weitwinkel-Gelenkwelle einseitig','Schlauchhaspel 1½" × 20 m + Mehrzweckstrahlrohr (bis 8 bar)','Breitverteiler · Zweiflansch-Plattenschieber 5"','Hydrantenbefüllung (B-Anschluss) · Füllstandsanzeiger','Mannloch Ø 600 mm · Zusatzsiphon','Beleuchtung 12 V · Warntafeln · klappbares Stützrad','Fabrikneu, Baujahr 2024','24 Monate Garantie auf Behälter & Rahmen'],
    price_cents:1240000, compare_cents:null, image:'fliegl-wfw-4000.jpg',
    gallery:['fliegl-wfw-4000-2.jpg','fliegl-wfw-4000-3.jpg'],
    sort_order:10 },

  { slug:'fliegl-vfw-8600', name:'FLIEGL VFW 8600 Jumbo Line Vakuumfass (8.600 Liter)', type:'Vakuumfass · Schleudertankwagen · 8.600 Liter', category:'vakuumfass', group:'guellefass', bestseller:1, min_order:1, max_order:5,
    dimensions:'Einachs-Fahrwerk · Bereifung 710/50 R30.5 · 40 km/h (COC)', load_capacity:'Fassungsvermögen 8.600 Liter', baujahr:'2026',
    short_desc:'Verzinktes FLIEGL VFW 8600 Jumbo Line Vakuumfass mit 8.600 Litern, Hertell-Kompressor, hydraulischem Glockenschieber und Bergabentleerung. Für Hanglagen. Fabrikneu.',
    description:'Das FLIEGL VFW 8600 Jumbo Line ist ein verzinktes Vakuum-Güllefass (Schleudertankwagen) mit 8.600 Litern Fassungsvermögen. Die Jumbo Line ist speziell für kleinstrukturierte Flächen und steile Hanglagen konzipiert und überzeugt durch ihre Wendigkeit und den niedrigen Schwerpunkt. Für Befüllung und Ausbringung sorgt ein Hertell-Kompressor (8.000 l, max. 540 U/min) in Verbindung mit hydraulischem Glockenschieber und Siphon. Serienmäßig verfügt das Fass über eine Bergabentleerung, einen Füllstandsanzeiger mit Schwimmer, eine Anbaukonsole für Schleppschuhverteiler, Radausschnitt sowie eine Gelenkwelle. Gebremst wird über eine 2-Kreis-Druckluftbremse mit ALB (DL-Anlage mit ALB); die 40-km/h-Ausführung ist mit COC-Papieren ausgestattet und läuft auf Flotationsbereifung 710/50 R30.5. Der feuerverzinkte Behälter sorgt für Langlebigkeit und zuverlässigen Korrosionsschutz. Neumaschine, Baujahr 2026. Auf Behälter und Rahmen gewähren wir 24 Monate Garantie.',
    features:['Fassungsvermögen 8.600 Liter','Verzinkter Vakuumbehälter (Schleudertankwagen)','Bergabentleerung – für Hanglagen','Hertell-Kompressor 8.000 l (max. 540 U/min)','Hydraulischer Glockenschieber','Füllstandsanzeiger mit Schwimmer','2-Kreis-Druckluftbremse mit ALB · DL-Anlage mit ALB','40 km/h Ausführung mit COC','Flotationsbereifung 710/50 R30.5 · Radausschnitt','Anbaukonsole für Schleppschuhverteiler','Gelenkwelle · Siphon','Neumaschine, Baujahr 2026','24 Monate Garantie auf Behälter & Rahmen'],
    price_cents:1790000, compare_cents:null, image:'fliegl-vfw-8600.jpg',
    gallery:['fliegl-vfw-8600-2.jpg','fliegl-vfw-8600-3.jpg','fliegl-vfw-8600-4.jpg'],
    sort_order:9 },

  // ============ Sägen ============
  { slug:'stihl-ms-500i', name:'STIHL Benzin-Kettensäge MS 500i', type:'Benzin-Kettensäge · Profi-Klasse', category:'motorsaege', group:'saege', bestseller:1, min_order:1, max_order:10,
    dimensions:'Leergewicht ca. 6,2 kg', load_capacity:'Leistung 5,0 kW (6,8 PS) · Hubraum 79,2 cm³',
    short_desc:'Die weltweit erste Profi-Motorsäge mit elektronischer Kraftstoffeinspritzung. Bestes Leistungsgewicht am Markt, beschleunigt in 0,25 s von 0 auf 100 km/h. Ideal für Starkholz.',
    description:'Die STIHL MS 500i ist die weltweit erste Profi-Motorsäge mit elektronischer Kraftstoffeinspritzung. Optimal für das Aufarbeiten von Starkholz, überzeugt sie mit dem besten Leistungsgewicht am Markt und beschleunigt in nur 0,25 Sekunden von 0 auf 100 km/h. Dank Einspritzung startet und bedient sie sich besonders einfach, ohne Vergaser-Einstellungen und mit sofortigem Ansprechverhalten in jeder Lage. Mit 79,2 cm³ Hubraum und 5,0 kW Leistung bei nur rund 6,2 kg Leergewicht liefert sie kompromisslose Schnittleistung für den professionellen Forsteinsatz. Wählen Sie oben die passende Ausführung und Schnittlänge (50, 63 oder 71 cm in der RS-Variante) oder die robuste RH-Schiene mit 50 cm.',
    features:['Weltweit erste Motorsäge mit elektronischer Einspritzung','Optimal für das Aufarbeiten von Starkholz','Bestes Leistungsgewicht am Markt','Beschleunigung 0,25 s von 0 auf 100 km/h','Sehr einfach zu starten und zu bedienen','Hubraum 79,2 cm³ · Leistung 5,0 kW (6,8 PS)','Leergewicht ca. 6,2 kg','Schnittlängen 50 / 63 / 71 cm (RS) sowie RH 50 cm wählbar','24 Monate Garantie'],
    variants:[
      { label:'RS · Schnittlänge 50 cm', price_cents:102521 },
      { label:'RS · Schnittlänge 63 cm', price_cents:107143 },
      { label:'RS · Schnittlänge 71 cm', price_cents:112185 },
      { label:'RH · Schienenlänge 50 cm', price_cents:116807 }
    ],
    manual_pdf:'/docs/stihl-ms-500i-bedienungsanleitung.pdf',
    safety_note:'Um die Gefahren einer Motorsäge zu erkennen oder einzuschätzen, ist eine Einweisung notwendig. Zudem sind die Anforderungen an die Sicherheitskleidung zu beachten.',
    price_cents:102521, compare_cents:null, image:'stihl-ms-500i.jpg',
    gallery:['stihl-ms-500i-2.jpg','stihl-ms-500i-3.jpg','stihl-ms-500i-4.jpg'],
    sort_order:10 },

  { slug:'stihl-ms-881', name:'STIHL Benzin-Kettensäge MS 881', type:'Benzin-Kettensäge · Profi-Klasse', category:'motorsaege', group:'saege', bestseller:0, min_order:1, max_order:10,
    dimensions:'Leergewicht ca. 9,9 kg', load_capacity:'Leistung 6,4 kW (8,7 PS) · Hubraum 121,6 cm³',
    short_desc:'Extrem leistungsstarke STIHL Profi-Motorsäge für härteste Einsätze. Kraftvoller, abgasarmer 6,4-kW-Motor, moderne Ölpumpe und werkzeuglose Tankverschlüsse.',
    description:'Die STIHL MS 881 ist die leistungsstärkste Motorsäge im STIHL Programm und für Profi-Einsätze unter härtesten Bedingungen konzipiert. Ihr kraftvoller, abgasarmer Motor mit 6,4 kW (8,7 PS) aus 121,6 cm³ Hubraum meistert stärkstes Holz und lange Dauereinsätze souverän. Eine moderne Ölpumpe sorgt für optimalen Ölfluss, die werkzeuglosen Tankverschlüsse und die verliersichere Mutter am Kettenraddeckel erleichtern die Handhabung im Wald. Wählen Sie oben die passende Schienenlänge (63 oder 75 cm). Fabrikneu geliefert.',
    features:['Extrem leistungsstarke STIHL Benzin-Motorsäge','Für Profi-Einsätze unter härtesten Bedingungen','Kraftvoller, abgasarmer 6,4-kW-Motor (8,7 PS)','Hubraum 121,6 cm³ · Leergewicht ca. 9,9 kg','Werkzeuglose Tankverschlüsse','Moderne Ölpumpe für optimalen Ölfluss','Verliersichere Mutter am Kettenraddeckel','Schienenlängen 63 und 75 cm wählbar','24 Monate Garantie'],
    variants:[
      { label:'RS · Schienenlänge 63 cm', price_cents:124370 },
      { label:'RS · Schienenlänge 75 cm', price_cents:140336 }
    ],
    manual_pdf:'/docs/stihl-ms-881-bedienungsanleitung.pdf',
    safety_note:'Um die Gefahren einer Motorsäge zu erkennen oder einzuschätzen, ist eine Einweisung notwendig. Zudem sind die Anforderungen an die Sicherheitskleidung zu beachten.',
    price_cents:124370, compare_cents:null, image:'stihl-ms-881.jpg',
    gallery:['stihl-ms-881-2.jpg','stihl-ms-881-3.jpg'],
    sort_order:11 },

  { slug:'husqvarna-592-xp', name:'Husqvarna Motorsäge 592 XP 24"', type:'Benzin-Kettensäge · Profi-Klasse', category:'motorsaege', group:'saege', bestseller:0, min_order:1, max_order:10,
    dimensions:'Leergewicht ca. 7,3 kg', load_capacity:'Leistung 5,8 kW (7,9 PS) · Hubraum 93,6 cm³',
    short_desc:'Robuste, langlebige Profi-Kettensäge für Forst- und Baumpflegearbeiten. Mit AutoTune 3.0, leistungsstarkem X-Torq-Motor und 24" (61 cm) X-Tough-Schiene.',
    description:'Die Husqvarna Motorsäge 592 XP wurde für Forst- und Baumpflegearbeiter entwickelt, die eine robuste und langlebige Kettensäge suchen, die sich auch unter schwierigen Bedingungen leicht manövrieren und warten lässt. Mit AutoTune 3.0 startet diese Kettensäge leicht und läuft unter allen Bedingungen optimal. Der leistungsstarke X-Torq-Motor in Kombination mit den X-Cut C85/C83-Ketten bietet eine hervorragende Schnittleistung. Sie ist ausgestattet mit einer 24" (61 cm) X-Tough-Schiene und inklusive C-85 Kette. Verlustsichere Schrauben verhindern das Lösen wichtiger Teile, das niedrige Gewicht der beweglichen Motorteile sorgt für hohe Beschleunigung. Der X-TORQ-Motor senkt dank intelligenter Zweitakttechnologie den Kraftstoffverbrauch und reduziert die Schadstoffemissionen deutlich.',
    features:['Hohe Beschleunigung','Verlustsichere Schrauben','24" (61 cm) X-Tough-Schiene','AutoTune 3.0','Leistungsstarker X-Torq-Motor','Inkl. X-Cut C-85 Kette','Hubraum 93,6 cm³ · Leistung 5,8 kW (7,9 PS)','Für Forst- und Baumpflegearbeiten','24 Monate Garantie'],
    safety_note:'Um die Gefahren einer Motorsäge zu erkennen oder einzuschätzen, ist eine Einweisung notwendig. Zudem sind die Anforderungen an die Sicherheitskleidung zu beachten.',
    addon:{ label:'Husqvarna Lagerfett für Motorsägen', price_cents:588, image:'husqvarna-lagerfett.jpg' },
    price_cents:100840, compare_cents:null, image:'husqvarna-592-xp.jpg',
    gallery:[],
    sort_order:12 },

  // ============ Ernteboxen ============
  { slug:'obst-gemuesekiste-600x400', name:'Obst- und Gemüsekiste 600 × 400 · 46 Liter (lebensmittelecht)', type:'Eurobehälter · HDPE · lebensmittelecht', category:'stapelkiste', group:'erntebox', bestseller:1, min_order:50, max_order:5000,
    dimensions:'Außen 600 × 400 × 240 mm · Innen 565 × 365 × 225 mm', load_capacity:'Fassungsvermögen 46 Liter',
    short_desc:'Stapelbare Obst- und Gemüsekiste (Euro-Grundmaß 600 × 400 mm) aus lebensmittelechtem HDPE. Leicht, robust und pflegeleichter als Holz, mit durchbrochenem Boden/Seiten und Griffmulden.',
    description:'Obst- und Gemüsekisten sind ideal für alle Anforderungen, die frisches Obst und Gemüse mit sich bringen. Die Kunststoffboxen sind aus Ernte und Verkauf nicht mehr wegzudenken: Sie sind leichter als Holzkisten, aber genauso stabil und robust, dabei deutlich pflegeleichter und langlebiger. Das Volumen der Kiste beträgt 46 Liter, das Grundmaß liegt beim gängigen Euro-Format 600 × 400 mm bei einer Höhe von 240 mm. Der durchbrochene Boden und die durchbrochenen Seiten sorgen für eine gute Belüftung des Ernteguts. Dank der praktischen Kunststoffbehälter müssen Sie sich bei der Ernte nicht mehr ständig bücken – die Kisten lassen sich einfach mehrfach übereinanderstapeln, sodass Sie rückenschonend und gesund arbeiten. Die großzügigen Griffmulden erleichtern das Hin- und Hertragen spürbar. Das Material ist lebensmittelechtes HDPE, geeignet für den direkten Kontakt mit Lebensmitteln gemäß den geltenden EU-Vorgaben (VO (EG) 1935/2004). Auf diese Kiste gewähren wir 24 Monate Garantie.',
    features:['Lebensmittelecht (HDPE) – für direkten Lebensmittelkontakt','Euro-Grundmaß 600 × 400 mm · stapelbar','Fassungsvermögen 46 Liter','Durchbrochener Boden & Seiten – gute Belüftung','Großzügige Griffmulden','Leichter & langlebiger als Holzkisten','Farbe grün · Gewicht 1,98 kg','Außen 600×400×240 mm · Innen 565×365×225 mm','45 Stück pro Palette','24 Monate Garantie'],
    price_cents:830, compare_cents:null, image:'obst-gemuesekiste-600x400.jpg',
    gallery:['obst-gemuesekiste-600x400-2.jpg'],
    sort_order:20 },

  { slug:'obst-gemuesekiste-600x400-38l', name:'Obst- und Gemüsekiste 600 × 400 · 38 Liter (lebensmittelecht)', type:'Eurobehälter · HDPE · lebensmittelecht', category:'stapelkiste', group:'erntebox', bestseller:0, min_order:50, max_order:5000,
    dimensions:'Außen 600 × 400 × 200 mm · Innen 565 × 365 × 185 mm', load_capacity:'Fassungsvermögen 38 Liter',
    short_desc:'Stapelbare Obst- und Gemüsekiste (Euro-Grundmaß 600 × 400 mm) aus lebensmittelechtem HDPE, 38 Liter. Leicht, robust und pflegeleichter als Holz, mit durchbrochenem Boden/Seiten und Griffmulden.',
    description:'Obst- und Gemüsekisten sind ideal für alle Anforderungen, die frisches Obst und Gemüse mit sich bringen. Die Kunststoffboxen sind aus Ernte und Verkauf nicht mehr wegzudenken: Sie sind leichter als Holzkisten, aber genauso stabil und robust, dabei deutlich pflegeleichter und langlebiger. Das Volumen dieser Kiste beträgt 38 Liter, das Grundmaß liegt beim gängigen Euro-Format 600 × 400 mm bei einer Höhe von 200 mm. Der durchbrochene Boden und die durchbrochenen Seiten sorgen für eine gute Belüftung des Ernteguts. Dank der praktischen Kunststoffbehälter müssen Sie sich bei der Ernte nicht mehr ständig bücken – die Kisten lassen sich einfach mehrfach übereinanderstapeln, sodass Sie rückenschonend und gesund arbeiten. Die großzügigen Griffmulden erleichtern das Hin- und Hertragen spürbar. Das Material ist lebensmittelechtes HDPE, geeignet für den direkten Kontakt mit Lebensmitteln gemäß den geltenden EU-Vorgaben (VO (EG) 1935/2004). Auf diese Kiste gewähren wir 24 Monate Garantie.',
    features:['Lebensmittelecht (HDPE) – für direkten Lebensmittelkontakt','Euro-Grundmaß 600 × 400 mm · stapelbar','Fassungsvermögen 38 Liter','Durchbrochener Boden & Seiten – gute Belüftung','Großzügige Griffmulden','Leichter & langlebiger als Holzkisten','Farbe grün · Gewicht 1,71 kg','Außen 600×400×200 mm · Innen 565×365×185 mm','55 Stück pro Palette','24 Monate Garantie'],
    price_cents:730, compare_cents:null, image:'obst-gemuesekiste-600x400-38l.jpg',
    gallery:['obst-gemuesekiste-600x400-38l-2.jpg'],
    sort_order:21 },

  { slug:'obst-gemuesekiste-600x400-32l', name:'Obst- und Gemüsekiste 600 × 400 · 32 Liter (lebensmittelecht)', type:'Eurobehälter · HDPE · lebensmittelecht', category:'stapelkiste', group:'erntebox', bestseller:0, min_order:50, max_order:5000,
    dimensions:'Außen 600 × 400 × 170 mm · Innen 565 × 365 × 155 mm', load_capacity:'Fassungsvermögen 32 Liter',
    short_desc:'Stapelbare Obst- und Gemüsekiste (Euro-Grundmaß 600 × 400 mm) aus lebensmittelechtem HDPE, 32 Liter. Leicht, robust und pflegeleichter als Holz, mit durchbrochenem Boden/Seiten und Griffmulden.',
    description:'Obst- und Gemüsekisten sind ideal für alle Anforderungen, die frisches Obst und Gemüse mit sich bringen. Die Kunststoffboxen sind aus Ernte und Verkauf nicht mehr wegzudenken: Sie sind leichter als Holzkisten, aber genauso stabil und robust, dabei deutlich pflegeleichter und langlebiger. Das Volumen dieser Kiste beträgt 32 Liter, das Grundmaß liegt beim gängigen Euro-Format 600 × 400 mm bei einer Höhe von 170 mm. Der durchbrochene Boden und die durchbrochenen Seiten sorgen für eine gute Belüftung des Ernteguts. Dank der praktischen Kunststoffbehälter müssen Sie sich bei der Ernte nicht mehr ständig bücken – die Kisten lassen sich einfach mehrfach übereinanderstapeln, sodass Sie rückenschonend und gesund arbeiten. Die großzügigen Griffmulden erleichtern das Hin- und Hertragen spürbar. Das Material ist lebensmittelechtes HDPE, geeignet für den direkten Kontakt mit Lebensmitteln gemäß den geltenden EU-Vorgaben (VO (EG) 1935/2004). Auf diese Kiste gewähren wir 24 Monate Garantie.',
    features:['Lebensmittelecht (HDPE) – für direkten Lebensmittelkontakt','Euro-Grundmaß 600 × 400 mm · stapelbar','Fassungsvermögen 32 Liter','Durchbrochener Boden & Seiten – gute Belüftung','Großzügige Griffmulden','Leichter & langlebiger als Holzkisten','Farbe grün · Gewicht 1,56 kg','Außen 600×400×170 mm · Innen 565×365×155 mm','80 Stück pro Palette','24 Monate Garantie'],
    price_cents:630, compare_cents:null, image:'obst-gemuesekiste-600x400-32l.jpg',
    gallery:['obst-gemuesekiste-600x400-32l-2.jpg'],
    sort_order:22 },

  { slug:'obst-gemuesekiste-600x400-26l', name:'Obst- und Gemüsekiste 600 × 400 · 26 Liter (lebensmittelecht)', type:'Eurobehälter · HDPE · lebensmittelecht', category:'stapelkiste', group:'erntebox', bestseller:0, min_order:50, max_order:5000,
    dimensions:'Außen 600 × 400 × 142 mm · Innen 565 × 365 × 125 mm', load_capacity:'Fassungsvermögen 26 Liter',
    short_desc:'Stapelbare Obst- und Gemüsekiste (Euro-Grundmaß 600 × 400 mm) aus lebensmittelechtem HDPE, 26 Liter. Leicht, robust und pflegeleichter als Holz, mit durchbrochenem Boden/Seiten und Griffmulden.',
    description:'Obst- und Gemüsekisten sind ideal für alle Anforderungen, die frisches Obst und Gemüse mit sich bringen. Die Kunststoffboxen sind aus Ernte und Verkauf nicht mehr wegzudenken: Sie sind leichter als Holzkisten, aber genauso stabil und robust, dabei deutlich pflegeleichter und langlebiger. Das Volumen dieser Kiste beträgt 26 Liter, das Grundmaß liegt beim gängigen Euro-Format 600 × 400 mm bei einer Höhe von 142 mm. Der durchbrochene Boden und die durchbrochenen Seiten sorgen für eine gute Belüftung des Ernteguts. Dank der praktischen Kunststoffbehälter müssen Sie sich bei der Ernte nicht mehr ständig bücken – die Kisten lassen sich einfach mehrfach übereinanderstapeln, sodass Sie rückenschonend und gesund arbeiten. Die großzügigen Griffmulden erleichtern das Hin- und Hertragen spürbar. Das Material ist lebensmittelechtes HDPE, geeignet für den direkten Kontakt mit Lebensmitteln gemäß den geltenden EU-Vorgaben (VO (EG) 1935/2004). Auf diese Kiste gewähren wir 24 Monate Garantie.',
    features:['Lebensmittelecht (HDPE) – für direkten Lebensmittelkontakt','Euro-Grundmaß 600 × 400 mm · stapelbar','Fassungsvermögen 26 Liter','Durchbrochener Boden & Seiten – gute Belüftung','Großzügige Griffmulden','Leichter & langlebiger als Holzkisten','Farbe grün · Gewicht 1,34 kg','Außen 600×400×142 mm · Innen 565×365×125 mm','70 Stück pro Palette','24 Monate Garantie'],
    price_cents:530, compare_cents:null, image:'obst-gemuesekiste-600x400-26l.jpg',
    gallery:[],
    sort_order:23 },
];

function hashStr(s){ let h=0; for(let i=0;i<s.length;i++){ h=(h*31 + s.charCodeAt(i))>>>0; } return h; }
// Feste, gewünschte Bewertungen je Produkt (avg = Sterne, count = Anzahl Bewertungen).
// count 0 = "keine Bewertung".
const RATING_OVERRIDES = {
  // Seilwinden
  'tajfun-egv-85-ahk-sg': { avg: 5.0, count: 22 },   // Bestseller
  'uniforest-65-h-pro':   { avg: 5.0, count: 11 },
  'krpan-55-eh':          { avg: 5.0, count: 9 },
  // Güllefässer / Wasserwagen
  'fliegl-vfw-8600':      { avg: 5.0, count: 2 },     // Bestseller, 5 Sterne, 2 Bewertungen
  'fliegl-wfw-4000':      { avg: 0,   count: 0 },     // keine Bewertung
  // Sägen
  'stihl-ms-500i':        { avg: 5.0, count: 33 },    // Bestseller
  'stihl-ms-881':         { avg: 4.9, count: 14 },
  'husqvarna-592-xp':     { avg: 4.8, count: 11 },
  // Ernteboxen
  'obst-gemuesekiste-600x400':     { avg: 5.0, count: 320 }, // Bestseller
  'obst-gemuesekiste-600x400-38l': { avg: 5.0, count: 210 },
  'obst-gemuesekiste-600x400-32l': { avg: 4.9, count: 128 }, // der eine "Ausreißer"
  'obst-gemuesekiste-600x400-26l': { avg: 5.0, count: 84 },
};

// Fester Lagerbestand je Produkt (deterministisch). Kleine Zahl = "nur noch wenige".
// Boxen haben Mindestbestellmenge 50, daher sind "wenige"-Werte dort entsprechend höher.
const STOCK_OVERRIDES = {
  'tajfun-egv-85-ahk-sg': 3,   // beliebte Seilwinde: nur noch wenige
  'uniforest-65-h-pro': 22,
  'krpan-55-eh': 20,
  'fliegl-vfw-8600': 15,
  'fliegl-wfw-4000': 15,
  'stihl-ms-500i': 4,          // beliebte Säge: nur noch wenige
  'stihl-ms-881': 20,
  'husqvarna-592-xp': 20,
  'obst-gemuesekiste-600x400': 1000,
  'obst-gemuesekiste-600x400-38l': 250,  // die eine Box: nur noch wenige (unter 300)
  'obst-gemuesekiste-600x400-32l': 1000,
  'obst-gemuesekiste-600x400-26l': 1000,
};

function seedRating(p){
  if (RATING_OVERRIDES[p.slug]) return RATING_OVERRIDES[p.slug];
  const h = hashStr(p.slug);
  const count = 18 + (h % 52);
  const opts = [4.6, 4.7, 4.8, 4.9, 5.0];
  const avg = p.bestseller ? 5.0 : opts[h % opts.length];
  return { avg, count };
}

const insert = db.prepare(`INSERT INTO products
  (slug,name,type,category,product_group,bestseller,sold_out,min_order,max_order,rating_seed_avg,rating_seed_count,dimensions,load_capacity,baujahr,short_desc,description,features,price_cents,compare_cents,image,gallery,color_options,variants,manual_pdf,safety_note,addon,sort_order,stock,active)
  VALUES (@slug,@name,@type,@category,@group,@bestseller,@sold_out,@min_order,@max_order,@rating_seed_avg,@rating_seed_count,@dimensions,@load_capacity,@baujahr,@short_desc,@description,@features,@price_cents,@compare_cents,@image,@gallery,@color_options,@variants,@manual_pdf,@safety_note,@addon,@sort_order,@stock,1)
  ON CONFLICT(slug) DO NOTHING`);

const insertMany = db.transaction((rows) => {
  for (const r of rows) {
    const sr = seedRating(r);
    insert.run({
      slug: r.slug, name: r.name, type: r.type, category: r.category, group: r.group,
      bestseller: r.bestseller ? 1 : 0, sold_out: r.sold_out ? 1 : 0,
      min_order: r.min_order || 1, max_order: r.max_order || 10,
      rating_seed_avg: sr.avg, rating_seed_count: sr.count,
      dimensions: r.dimensions || '', load_capacity: r.load_capacity || '',
      baujahr: r.baujahr || null,
      short_desc: r.short_desc || '', description: r.description || '',
      features: JSON.stringify(r.features || []),
      price_cents: r.price_cents, compare_cents: (r.compare_cents == null ? null : r.compare_cents),
      image: r.image || '', gallery: JSON.stringify(r.gallery || []),
      color_options: JSON.stringify(r.color_options || []),
      variants: JSON.stringify(r.variants || []),
      manual_pdf: r.manual_pdf || null,
      safety_note: r.safety_note || null,
      addon: r.addon ? JSON.stringify(r.addon) : null,
      sort_order: r.sort_order || 0,
      stock: (r.stock == null ? null : r.stock)
    });
  }
});

function seedProducts() {
  insertMany(PRODUCTS);
  // Beschreibende Inhalte für bereits vorhandene Produkte aus seed.js nachziehen
  // (ON CONFLICT DO NOTHING aktualisiert bestehende Zeilen nicht). Preis, Bestand,
  // Bewertungen und Sortierung bleiben unangetastet.
  try {
    const upd = db.prepare(`UPDATE products SET name=@name, type=@type, category=@category,
      product_group=@group, dimensions=@dimensions, load_capacity=@load_capacity, baujahr=@baujahr,
      short_desc=@short_desc, description=@description, features=@features, image=@image, gallery=@gallery,
      variants=@variants, manual_pdf=@manual_pdf, safety_note=@safety_note, addon=@addon
      WHERE slug=@slug`);
    for (const r of PRODUCTS) {
      upd.run({ slug: r.slug, name: r.name, type: r.type, category: r.category, group: r.group,
        dimensions: r.dimensions || '', load_capacity: r.load_capacity || '', baujahr: r.baujahr || null,
        short_desc: r.short_desc || '', description: r.description || '', features: JSON.stringify(r.features || []),
        image: r.image || '', gallery: JSON.stringify(r.gallery || []),
        variants: JSON.stringify(r.variants || []), manual_pdf: r.manual_pdf || null, safety_note: r.safety_note || null,
        addon: r.addon ? JSON.stringify(r.addon) : null });
    }
  } catch (e) {}
  // Alt-Produkte aus einem früheren Sortiment entfernen (falls in der DB vorhanden).
  try { db.prepare("DELETE FROM products WHERE product_group IN ('gitterbox','gebraucht','palette','container')").run(); } catch (e) {}
  // Beispiel-/Platzhalterprodukte entfernen (nur echte Artikel bleiben im Shop).
  try { db.prepare("DELETE FROM products WHERE description LIKE '%Beispielprodukt%'").run(); } catch (e) {}
  // Gewünschte Bewertungen (Sterne + Anzahl) fest setzen – auch für bereits vorhandene Produkte.
  try {
    const ur = db.prepare('UPDATE products SET rating_seed_avg=?, rating_seed_count=? WHERE slug=?');
    for (const slug of Object.keys(RATING_OVERRIDES)) { const r = RATING_OVERRIDES[slug]; ur.run(r.avg, r.count, slug); }
  } catch (e) {}
  // Fester Lagerbestand je Produkt setzen (auch für bereits vorhandene Produkte).
  try {
    const us = db.prepare('UPDATE products SET stock=? WHERE slug=?');
    for (const slug of Object.keys(STOCK_OVERRIDES)) { us.run(STOCK_OVERRIDES[slug], slug); }
  } catch (e) {}
  // Bestseller je Kategorie sicherstellen: Hat eine Kategorie noch KEINEN Bestseller,
  // wird automatisch das TEUERSTE aktive Produkt der Kategorie zum Bestseller.
  // Bereits vom Admin gesetzte Bestseller bleiben unberührt (Auswahl im Admin hat Vorrang).
  try {
    const groups = db.prepare("SELECT DISTINCT product_group AS g FROM products WHERE active=1 AND image IS NOT NULL AND image!=''").all();
    for (const row of groups) {
      const has = db.prepare("SELECT COUNT(*) AS n FROM products WHERE product_group=? AND bestseller=1").get(row.g).n;
      if (!has) {
        const top = db.prepare("SELECT id FROM products WHERE product_group=? AND active=1 AND image IS NOT NULL AND image!='' ORDER BY price_cents DESC, id LIMIT 1").get(row.g);
        if (top) db.prepare("UPDATE products SET bestseller=1 WHERE id=?").run(top.id);
      }
    }
  } catch (e) {}
  try {
    const seeded = db.prepare("SELECT value FROM settings WHERE key='stock_seeded'").get();
    if (!seeded) {
      const setStock = db.prepare("UPDATE products SET stock=? WHERE slug=? AND stock IS NULL");
      for (const r of PRODUCTS) { const s = 3 + Math.floor(Math.random() * 8); setStock.run(s, r.slug); }
      db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('stock_seeded','1')").run();
    }
  } catch (e) {}
}

if (require.main === module) {
  if (reset) {
    db.prepare('DELETE FROM products').run();
    try { db.prepare('DELETE FROM carts').run(); } catch (e) {}
    try { db.prepare('DELETE FROM user_carts').run(); } catch (e) {}
    console.log('Bestehende Produkte gelöscht.');
  }
  seedProducts();
  const total = db.prepare('SELECT COUNT(*) AS n FROM products').get().n;
  console.log(`Seed fertig: ${total} Produkte in der Datenbank.`);
}

module.exports = { PRODUCTS, seedProducts };
