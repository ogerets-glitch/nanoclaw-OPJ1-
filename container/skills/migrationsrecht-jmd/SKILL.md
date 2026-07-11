---
name: migrationsrecht-jmd
description: "Aufenthalts-, Asyl- und migrationsbezogenes Sozialrecht für die Beratung junger Menschen im Jugendmigrationsdienst (JMD). Deckt AufenthG, AsylG, FreizügG/EU, SGB II/VIII/XII, AsylbLG, StAG und EU-Asylrecht (GEAS, Dublin-III, EuGH) ab. Nutze diesen Skill bei Fragen zu Aufenthaltstiteln, Duldung, Ausbildungs-/Beschäftigungsduldung, Aufenthalt für gut integrierte Jugendliche/Heranwachsende, Familiennachzug, Asylverfahren, Leistungen für junge Migrant*innen, unbegleiteten Minderjährigen, Einbürgerung — und immer wenn Begriffe wie Duldung, Aufenthaltserlaubnis, § 25a/25b, AsylG, Dublin, GEAS, BAMF, Ausländerbehörde, unbegleitet auftreten. Ergänzt den rechtsrecherche-Skill um die JMD-Fachstruktur."
---

# Migrationsrecht (JMD)

Du unterstützt Olivers Rechtsberatung im **Jugendmigrationsdienst** — Zielgruppe sind junge
Menschen mit Migrationshintergrund (Schwerpunkt 12–27 Jahre). Dieser Skill liefert die
Fach-Landkarte; die Recherche-Methodik kommt aus dem `rechtsrecherche`-Skill, der Datenschutz
aus `datenschutz-routing` (Sozialdaten, Asylstatus = besonders sensibel — vor jeder Anfrage anonymisieren).

> ⚠️ **Aktualität ist hier kritisch.** Migrationsrecht ändert sich schnell (Chancen-Aufenthaltsrecht,
> Rückführungsverbesserungsgesetz, GEAS-Reform 2024 mit Anwendung ab Mitte 2026). Die unten
> genannten Paragraphen sind ein **Prüfraster**, keine Aussage über den aktuellen Wortlaut —
> die geltende Fassung immer über `neuris_legislation_get`/`gii_lookup` bzw. `eurlex_lookup`
> verifizieren, bevor du sie zitierst.

## Wissensquellen für dieses Gebiet

- **OpenBrain Dokumente:** `search_documents_tool` (Collection `rechtsrecherche/sozialrecht` — BAMF-Merkblätter, Asylrecht, BA-Weisungen).
- **OpenBrain Memory:** `search_memory` — Olivers Fallwissen und aufbereitete Synthesen (z.B. GEAS-Beratungssynthese). **Zu Beginn jeder Recherche prüfen**, ob schon etwas vorliegt.
- **Bundesrecht/Urteile:** `neuris_search` (Gesetze + BVerwG/BSG), `old_search`/`old_cases` (VG/OVG/SG/LSG — nicht in NeuRIS), `gii_lookup` (Normtext).
- **EU-Recht:** `eurlex_lookup` (Verordnungen/Richtlinien per Slug `Dublin-III`, `Asylverfahrens-VO`, `Qualifikations-VO`), `eurlex_eugh` (EuGH per `C-…`).

## Teilgebiete und Prüfraster

### Aufenthaltsrecht (AufenthG) — typische Wege für junge Menschen
Bei jungen, im Bundesgebiet lebenden Menschen **immer mehrere Anspruchsgrundlagen parallel
prüfen** (vgl. `rechtsrecherche`-Skill Schritt 0):
- **§ 25a AufenthG** — Aufenthalt für gut integrierte Jugendliche/Heranwachsende.
- **§ 25b AufenthG** — Aufenthalt bei nachhaltiger Integration (i.d.R. ältere Bezugsgruppe).
- **§ 60a AufenthG** — Duldung; **§ 60c** Ausbildungsduldung, **§ 60d** Beschäftigungsduldung.
- **§§ 16a ff. AufenthG** — Aufenthalt zu Ausbildung/Studium.
- **Familiennachzug** §§ 27 ff.; **§ 36 / § 36a** Nachzug zu (unbegleiteten) Minderjährigen / subsidiär Schutzberechtigten.
- **Chancen-/Bleiberecht** (z.B. § 104c AufenthG) — auf aktuelle Fortgeltung prüfen.

→ Reihenfolge: günstigsten Status zuerst prüfen; eine Aufenthaltserlaubnis kann die Duldungsfrage obsolet machen.

### Asylrecht (AsylG) + EU-Asylrecht (GEAS)
- Verfahrensstand, Bescheid, **Rechtsbehelfsfrist** (⚠️ kurz — zuerst prüfen, Forum = VG, siehe `recht-jurisdiktion-de`).
- Dublin-Zuständigkeit → `eurlex_lookup` Dublin-III + `eurlex_eugh`.
- GEAS-Reform: Übergang alt/neu beachten (`gilt_ab`/`loest_ab`); Grenzverfahren-Risiken auch für Minderjährige präsent halten (siehe GEAS-Synthese in OpenBrain).

### Migrationsbezogenes Sozialrecht
- **AsylbLG** (Leistungen während Asylverfahren/Duldung), Übergang in **SGB II** (Bürgergeld) bei Statuswechsel.
- **SGB VIII** — Jugendhilfe, insb. unbegleitete minderjährige Ausländer (Inobhutnahme, Hilfe für junge Volljährige); prozessual Verwaltungsgerichtsbarkeit.
- **SGB XII** — bei Bedarf nachrangig.
- Forum: SG (SGB II/XII, AsylbLG-Streit teils SG) bzw. VG (SGB VIII) — im Einzelfall über `recht-jurisdiktion-de` klären.

### Freizügigkeit (FreizügG/EU)
- Unionsbürger und Familienangehörige → `eurlex_eugh` für EuGH-Rechtsprechung zur Freizügigkeit.

### Einbürgerung (StAG)
- Voraussetzungen, Fristen (reformiert) — aktuelle Fassung via `gii_lookup`/`neuris_legislation_get` verifizieren.

## Grundsätze

1. **Frist zuerst** — in Asyl-/Behördenverfahren ist die Rechtsbehelfsfrist der erste Prüfpunkt.
2. **Mehrere Wege parallel** — jungen Menschen steht oft mehr als ein Aufenthaltsweg offen.
3. **Aktualität verifizieren** — kein Migrationsparagraph wird ohne Fassungs-Check zitiert.
4. **Sozialdaten/Asylstatus = besonders sensibel** — strikt anonymisiert recherchieren.
5. **EU-Ebene mitdenken** — bei Asyl/Freizügigkeit ist der EuGH oft entscheidend.
