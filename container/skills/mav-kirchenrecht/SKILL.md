---
name: mav-kirchenrecht
description: "Kirchliches Arbeitsrecht und Mitarbeitervertretungs-Recht für die MAV-Arbeit bei der Caritas (Bistum Aachen): MAVO (Mitbestimmung, Anhörung, Information/Beratung, Beanstandung), AVR (Eingruppierung, Anlagen), KAVO, Abgrenzung und Analogie zum staatlichen BetrVG, sowie kirchlicher Datenschutz (KDG) im MAV-Kontext. Nutze diesen Skill bei Fragen zu Mitbestimmung der MAV, Dienstvereinbarungen, Anhörung bei Kündigung, Eingruppierung nach AVR, Beteiligungsrechten, MAV-Strategie, und immer wenn MAVO, AVR, KAVO, MAV, Dienstgeber, Mitbestimmung, Eingruppierung, Dienstvereinbarung auftreten. Ergänzt den rechtsrecherche-Skill um die MAV-Fachstruktur."
---

# MAV / Kirchliches Arbeitsrecht

Du unterstützt Olivers MAV-Arbeit bei der Caritas im **Bistum Aachen**. Dieser Skill liefert die
Fach-Landkarte; die Recherche-Methodik kommt aus dem `rechtsrecherche`-Skill. Kernregel: **MAVO
ist kein BetrVG, AVR ist kein TVöD** — konsequent als Kirchenrecht kennzeichnen, BetrVG nur als
*Analogie* bei echter Regelungslücke (vgl. `rechtsrecherche`-Skill Grundsatz 2).

> ⚠️ **Diözesane Fassung & Paragraphennummern verifizieren.** Die MAVO existiert als Rahmenordnung
> und in der für das Bistum Aachen geltenden Fassung; Novellen verschieben Nummern. Die unten
> genannten Paragraphen sind ein Prüfraster — die geltende Fassung über `search_documents_tool`
> (Collection `rechtsrecherche/mav`) gegenprüfen, bevor du sie zitierst.

## Wissensquellen für dieses Gebiet

- **OpenBrain Dokumente:** `search_documents_tool` (Collection `rechtsrecherche/mav` — MAVO, AVR, KAVO, MAV-Leitfaden, Arbeitshilfen). MAVO/AVR stehen in **keiner** öffentlichen Bundesdatenbank — diese Abfrage ist Pflicht.
- **OpenBrain Memory:** `search_memory` — Olivers MAV-Fallwissen, Strategie-Notizen, Studientags-Erfahrungen, frühere Recherchen (z.B. MAVO-Hebel beim Datenschutz, Kündigungsfälle). **Zu Beginn prüfen.**
- **Bundesrecht/Urteile (Analogie):** `neuris_search` mit `doc_type="legislation"` für BetrVG (insb. §§ 87, 99, 102 BetrVG) und `doc_type="case_law"` + `filter_court="BAG Erfurt"` für BAG-Rechtsprechung zur BetrVG↔MAVO-Analogie; `old_search` für LAG-Urteile.

## Teilgebiete und Prüfraster (MAVO — Fassung verifizieren)

### Beteiligungsrechte der MAV — nach Reichweite gestaffelt
- **Mitbestimmung** (§§ 33–36 MAVO): echtes Mitbestimmungsrecht; **§ 36 MAVO** insb. bei technischen Einrichtungen, die Verhalten/Leistung überwachen können (klassischer Hebel z.B. bei MS365/Teams).
- **Anhörung & Mitberatung bei Kündigung** (**§ 30 MAVO**): Wochenfrist für Einwendungen, Verständigungssitzung; Nichteinhaltung des Verfahrens kann die Kündigung unwirksam machen. Bei Kündigungsfällen immer BEM-Einladung und Anhörungsschreiben anfordern.
- **Information & Beratung** (**§§ 26, 27, 27a, 28 MAVO**): umfassende, rechtzeitige Unterrichtung in allen wesentlichen Angelegenheiten — reicht über reine Beschäftigtenkontrolle hinaus (z.B. Klientendatenschutz, soweit er die Arbeit der Beschäftigten berührt).
- **Beanstandungsrecht** (**§ 32 MAVO**): förmliche Beanstandung bei Gesetzesverstößen.
- **Förderpflicht** (**§ 26 Abs. 1 MAVO**): Wahrung der zugunsten der Beschäftigten geltenden Gesetze (DSGVO/KDG fallen darunter).

> Strategischer Hebel (aus Olivers Fallwissen): Bei IT-/Datenschutzthemen nicht nur über § 36
> (Mitarbeiterkontrolle) argumentieren, sondern §§ 26/28 (Information/Beratung, Förderpflicht)
> dazu ziehen — macht aus reinem Beschäftigtenschutz ein Berufs-/Auftragsschutz-Argument.

### AVR — Eingruppierung und Arbeitsbedingungen
- Eingruppierung über die einschlägige **AVR-Anlage** (z.B. Anlagen für Pflege/Sozial-/Erziehungsdienst); bei Stufenfragen alle Wege prüfen (einschlägige Berufserfahrung vs. Anschlussbeschäftigung — leicht übersehene Parallelgrundlage, vgl. `rechtsrecherche`-Skill Schritt 0).
- Sachverhalt vollständig erheben: welche Anlage, welche Entgeltgruppe/Stufe, Vorbeschäftigung, nahtloser Wechsel.

### Datenschutz im MAV-Kontext (KDG)
- Bei Caritas gilt das **KDG** (kirchlicher Datenschutz), nicht primär die DSGVO; Aufsicht KDSA West.
- Bei Beschäftigtendatenschutz und technischen Überwachungseinrichtungen Zusammenspiel KDG ↔ § 36 MAVO; Details siehe `datenschutz-routing`.

## Forum

- **MAV ↔ Dienstgeber (Mitbestimmungsstreit):** Einigungsstelle, dann kirchliche Arbeitsgerichtsbarkeit (KAGO-Rechtsweg) — **nicht** staatliches ArbG (siehe `recht-jurisdiktion-de`).
- **Individualkündigung eines kirchlichen Beschäftigten:** staatliches Arbeitsgericht (AVR als Vertragsinhalt).

## Grundsätze

1. **Kirchenrecht klar kennzeichnen** — MAVO/AVR nie unmarkiert wie staatliches Recht zitieren.
2. **BetrVG nur analog** — und nur, wo die MAVO eine echte Lücke hat, nicht wo sie bewusst anders regelt.
3. **OpenBrain ist Pflichtquelle** — MAVO/AVR sind nur dort maschinenlesbar; ohne diese Abfrage fehlt das Kernmaterial.
4. **Fassung verifizieren** — diözesane MAVO-Fassung und Paragraphennummern gegenprüfen.
5. **Verfahren ernst nehmen** — Beteiligungsrechte scheitern oft an Fristen/Form, nicht am Inhalt.
