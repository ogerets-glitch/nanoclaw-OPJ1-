---
name: jobsuche
description: >
  Stellen- und Ausbildungssuche über BA-Jobbörse und Jooble-Aggregator,
  mit fallbezogenen Vorschlägen zu Karriereseiten regional relevanter
  Arbeitgeber (öffentlicher Dienst, Kirche, Wohlfahrt, Großarbeitgeber
  Aachen/StädteRegion). Tools laufen im Arbeitsmarkt-MCP-Connector.
  Nutze diesen Skill IMMER bei Anfragen wie "Stelle/Job suchen",
  "Arbeitsstelle in [Ort]", "offene Stellen", "Ausbildungsplatz",
  "Praktikum", "Umschulung", bei Berufsangaben mit Ortsbezug
  ("Pflegekraft Aachen"), bei Klient:innen-Matching (Vorschläge für
  Person mit Sprachniveau/Qualifikation/Region) und bei
  Fachkräfteengpass-Recherchen. Liefert strukturierte Stellenlisten
  inkl. Kontaktdaten; Bewerbungs-Workflow läuft separat über den
  bewerbungs-skill, kein Auto-Übergang. NICHT bei: Gehaltsstatistik
  oder Arbeitsmarktdaten (→ statistik-Skill), Anschreiben/Lebenslauf
  (→ bewerbungs-skill).
---

# Jobsuche

Skill zur Recherche von Stellen- und Ausbildungsangeboten über den Arbeitsmarkt-MCP. Arbeitet mit zwei Quellen: der **BA-Jobbörse** als Primärquelle (offiziell, umfassend, kostenfrei) und dem **Jooble-Aggregator** als Fallback für private Stellenmärkte. Bei regionalem Bezug zu Aachen / StädteRegion / Umkreis schlägt der Skill zusätzlich fallbezogen Karriereseiten regionaler Arbeitgeber vor.

## Tools (5)

| Tool | Funktion |
|------|----------|
| `jobsuche_search` | BA-Stellenangebote nach Beruf, Ort, Umkreis, Arbeitszeit, Veröffentlichung filtern. Liefert Liste mit Kurzinfo. |
| `jobsuche_details` | Volltext einer BA-Stellenanzeige inkl. Anforderungen, Arbeitgeber-Kontakt, Bewerbungsweg. Immer nach `jobsuche_search` aufrufen, wenn eine Anzeige konkret interessiert. |
| `ausbildung_search` | BA-Ausbildungsangebote nach Beruf, Ort, Umkreis, Beginn filtern. Analoge Struktur zu `jobsuche_search`. |
| `ausbildung_details` | Volltext eines Ausbildungsangebots. Analog zu `jobsuche_details`. |
| `jooble_search` | Jooble-Aggregator. Deckt private Stellenbörsen ab, die nicht bei der BA gemeldet sind. **500 Requests pro Monat Hardlimit — sparsam einsetzen.** |

## Regional-Preset: Arbeitgeber-Vorschläge

Zusätzlich zu den 5 MCP-Tools arbeitet der Skill mit einem **regionalen Arbeitgeber-Preset** als Nachschlagewerk. Der Preset wird **nicht automatisch parallel abgefragt**, sondern liefert kontextspezifische **Vorschläge**: Nach der BA-Breitensuche identifiziert der Skill 3–5 Arbeitgeber aus dem Preset, deren Karriereseiten für die konkrete Anfrage sinnvoll sein könnten, und legt sie dem Nutzer zur Entscheidung vor.

- Liste und Pflege-Hinweise: siehe **`references/arbeitgeber-regional-aachen.md`**
- Abgedeckte Kategorien: öffentlicher Dienst (Kommunen, Land, Bund, Forschung), kirchlich/diakonisch/karitativ, Kliniken, Wohlfahrtsverbände, Hochschulen, private Großarbeitgeber
- Begründung: Kirchliche und freie Träger melden oft **lückenhaft an die BA-Jobbörse** — bei relevantem Berufsfeld lohnt sich die Direktabfrage. Aber nicht pauschal, sondern nur wenn sie zum konkreten Fall passt.
- Außerhalb Aachen/Umkreis: Preset greift nicht, es läuft nur die BA-Breitensuche.

Der Vorschlagsmechanismus ist in Workflow A und B als Schritt 3 integriert.

## Workflow A: Einfache Suche (Default)

Nutze diesen Workflow, wenn **keine strukturierten Personen-/Klient:innendaten** mitgegeben werden.

1. **Suchparameter aus Anfrage extrahieren** — Beruf/Stichwort, Ort, Umkreis (Default 50 km, nur bei expliziter Einschränkung kleiner), Arbeitszeit (Voll-/Teilzeit), Ausbildungs- vs. Stellenangebot.

2. **BA-Breitensuche** — `jobsuche_search` bzw. `ausbildung_search` mit Ort + Umkreis + Stichwort. Typische Ausgabe: 5–10 Treffer mit Titel, Arbeitgeber, Ort, Veröffentlichungsdatum.

3. **Arbeitgeber-Vorschläge** (nur wenn Einsatzregion Aachen / Umkreis; siehe Regel im Abschnitt „Vorschlagsregel" unten). Nach der BA-Sichtung prüfen: Welche 3 Arbeitgeber aus `references/arbeitgeber-regional-aachen.md` könnten für **genau diese Anfrage** zusätzlich interessant sein? Dem Nutzer als **nummerierte Liste mit Einzelbegründung** präsentieren. Festes Format:

   ```
   Zusätzliche Arbeitgeber, deren Karriereseiten ich prüfen könnte:

   1. [Arbeitgeber A] — [Begründung in halbem Satz]
   2. [Arbeitgeber B] — [Begründung in halbem Satz]
   3. [Arbeitgeber C] — [Begründung in halbem Satz]

   Welche soll ich zusätzlich abfragen? (z.B. „alle", „1 und 3", „nur 2", „keine")
   ```

   Bei Zustimmung (ganz oder teilweise): für jeden ausgewählten Arbeitgeber `web_fetch` auf die Karriereseite, bei 404 / leerem Ergebnis → `web_search` nach `"[Arbeitgeber] Karriere"` als Fallback. Bei „keine" direkt mit Schritt 4 weitermachen.

4. **Details zu Top-Treffern nachziehen** — bei offensichtlich passenden Treffern `jobsuche_details`/`ausbildung_details` aufrufen, um Kontaktdaten und Anforderungsprofil zu holen.

5. **Dedupe** (nur relevant, wenn Schritt 3 durchgeführt wurde) — siehe Abschnitt „Dedupe" unten.

6. **Jooble nur als Ergänzung** — wenn BA-Suche + ggf. Vorschläge wenig/keine Treffer liefern oder explizit nach privaten Portalen gefragt wird.

7. **Ausgabeformat** — strukturierte Liste: Titel, Arbeitgeber, Ort, Kontakt, Link, Bewerbungsfrist, Quelle (BA / Karriereseite / Jooble).

### Vorschlagsregel für Schritt 3

Wenn die Einsatzregion Aachen / Umkreis ist, **grundsätzlich 3 Arbeitgeber-Vorschläge** machen — unabhängig davon, wie gut die BA-Breitensuche abgedeckt hat. Der Nutzer entscheidet dann, ob er sie annimmt.

Auswahl der 3 Vorschläge fallbezogen, nicht mechanisch:

- **Berufsfeld-Filter:** Nur Arbeitgeber vorschlagen, bei denen das Berufsfeld plausibel ist (z.B. bei „Pflegekraft" keine Pharma-Firma, keine Hochschule als reines Vorschlagsziel).
- **BA-Lücken-Heuristik:** Wenn typische Arbeitgeber eines Bereichs in der BA-Suche fehlen (z.B. Kita-Stellen → Bistum / Caritas / Diakonie / Stadt Aachen melden oft nicht an BA), diese vorrangig vorschlagen.
- **Priorisierungstabelle** in `references/arbeitgeber-regional-aachen.md` als Entscheidungsgrundlage nutzen.
- **Begründung immer mitgeben.** Nicht nur Namen nennen, sondern in einem halben Satz erklären, warum dieser Arbeitgeber relevant sein könnte.

## Workflow B: Matching gegen Profil

Nutze diesen Workflow, wenn die Anfrage ein **Personenprofil** enthält (z. B. JMD-Klient:in, Familienmitglied, Beispielperson). Typische Profilbestandteile: Sprachniveau, Qualifikationen/Abschlüsse, Berufserfahrung, Einschränkungen (Arbeitszeit, Mobilität, Kinderbetreuung), Aufenthaltsstatus (ggf. Arbeitserlaubnis nötig).

### Profil strukturieren
Wenn das Profil als Fließtext kommt, in folgende Felder auflösen — fehlende Felder als „offen" markieren, nicht halluzinieren:

- **Wunschberuf / Berufsfeld**
- **Sprachniveau Deutsch** (A2 / B1 / B2 / C1) — relevant, weil nicht BA-API-Filter: **muss manuell aus Stellentext geprüft werden**
- **Formale Qualifikation** (Schulabschluss, Ausbildung, anerkannter Berufsabschluss, Anerkennungsverfahren laufend)
- **Einsatzregion** (Ort + Umkreis)
- **Arbeitszeit** (Voll-/Teilzeit, Schicht möglich?)
- **Aufenthaltsstatus** (nur wenn relevant: Arbeitserlaubnis, Beschäftigungserlaubnis nach § 4a AufenthG)
- **Mobilität** (ÖPNV-Bindung, Führerschein vorhanden?)

### Matching-Suche durchführen

1. **BA-Breitensuche** mit den harten Filtern (Berufsfeld, Ort, Umkreis, Arbeitszeit) — **nicht Sprachniveau, nicht Aufenthaltsstatus** (keine BA-API-Filter).
2. **Arbeitgeber-Vorschläge** (nur wenn Einsatzregion Aachen / Umkreis) — wie in Workflow A Schritt 3: 3–5 kontextrelevante Arbeitgeber mit Begründung vorschlagen, bei Zustimmung Karriereseiten fetchen. Hier besonders wichtig, weil Matching typischerweise Klient:innen mit Einschränkungen betrifft und der öffentliche/kirchliche Sektor oft passendere Konditionen bietet (Sprachniveau-Toleranz, Teilzeit, Anerkennungsverfahren im Gange).
3. **Dedupe** — siehe Abschnitt „Dedupe" unten.
4. **Top 15–20 Treffer** holen und `jobsuche_details` bzw. Karriereseiten-Volltext für die Kandidaten aufrufen, die auf den harten Filtern passen.
5. **Manuelle Nachfilterung** im Stellentext auf:
   - Sprachanforderung vs. tatsächliches Sprachniveau
   - Qualifikationsanforderung vs. formale Qualifikation
   - Versteckte Ausschlüsse (Führerschein, Schichtbereitschaft, körperliche Anforderungen)
6. **Ausgabe: Top 3–5 Matches** mit kurzer Begründung pro Treffer — *warum passt diese Stelle, was ist noch zu prüfen?*
7. **Ende des Jobsuche-Workflows.** Der Skill liefert die Top-Matches und hört hier auf. Wenn im Anschluss Anschreiben oder Lebenslauf erstellt werden sollen, muss der `bewerbungs-skill` **separat aufgerufen** werden — kein automatischer Übergang.

### Datenschutz bei Klient:innen-Matching

- **Keine PII** (Name, Geburtsdatum, Adresse, E-Mail, Dokumentnummern) in Tool-Queries. Nur anonymisierte Strukturdaten (Beruf, Ort-Umkreis, Sprachniveau).
- Jooble ist externer Aggregator — dort **besonders restriktiv** sein: keine personenbezogenen Merkmale in der Query, nur generische Berufs-/Ortsbegriffe.
- Wenn Profil aus JMD-Kontext stammt: PII-Firewall ist nachgelagert für Dokumente zuständig, dieser Skill ist aber **preventiv** — gar nicht erst PII in Queries einspeisen.

## Dedupe

Bei angenommenen Arbeitgeber-Vorschlägen liefern BA-Jobbörse und Karriereseiten häufig dieselbe Stelle doppelt — v.a. bei öffentlichen Arbeitgebern, die regelmäßig an die BA melden. Regel:

1. **Primärschlüssel: BA-Referenznummer** (`refnr`). Zwei Treffer mit identischer Referenznummer = identische Stelle. BA-Version behalten (enthält strukturierte Felder).
2. **Sekundärschlüssel: Fuzzy-Match auf (Arbeitgeber + Titel + Ort).** Bei ≥90 % Übereinstimmung als Duplikat werten. BA-Version behalten.
3. **Wenn beide Versionen unterschiedliche Zusatzinfos haben** (z.B. Karriereseite hat Direktkontakt, BA nur Vermittlungsweg): Karriereseite als Kontaktquelle vermerken, BA-Eintrag als Referenz.
4. **Transparenz:** Im Ausgabeformat pro Treffer vermerken, auf welchen Quellen er gefunden wurde (`Quelle: BA + Karriereseite`).

## Routing: BA vs. Jooble

| Situation | Primär | Begründung |
|-----------|--------|-----------|
| Reguläre Stellensuche | BA | Vollständiger, keine Request-Limits, offizielle Quelle |
| Ausbildungsplatz | BA (`ausbildung_search`) | Nur BA hat Ausbildungsregister |
| Jobsuche in Nische / Start-up / IT | BA zuerst, dann Jooble | Private Portale oft nicht bei BA gemeldet |
| Nur wenige BA-Treffer trotz sinnvoller Query | Jooble ergänzend | Fallback, **max. 1 Jooble-Query pro Anfrage** |
| Reine Statistikfrage zum Arbeitsmarkt | **Nicht dieser Skill** | → `statistik`-Skill |
| Gehaltsvergleich | **Nicht dieser Skill** | → `statistik`-Skill, GENESIS 62321 |

## Fallstricke

- **Sprachniveau ist kein BA-API-Filter.** Muss immer nachgelagert im Stellentext geprüft werden. Formulierungen wie „verhandlungssicher", „sehr gute Deutschkenntnisse" = mindestens C1; „gute Deutschkenntnisse" = B2; „Grundkenntnisse" = A2/B1.
- **Aufenthaltsstatus ist kein BA-API-Filter.** Wenn Arbeitserlaubnis eingeschränkt ist, im Anzeigentext nach Hinweisen suchen („nur EU-Bürger", „ohne Arbeitserlaubnis nicht möglich") — und im Zweifel Kontakt zur Ausländerbehörde / Rechtsrecherche-Skill für AufenthG-Details.
- **Arbeitgeber-Name variiert in BA-Datenbank.** „Caritas Aachen" steht dort oft als „Caritasverband für die Region Aachen e.V." — bei Vorschlägen, die der Nutzer annimmt, mehrere Schreibweisen probieren. Schreibweisen-Hinweise stehen in `references/arbeitgeber-regional-aachen.md`.
- **Karriereseiten-Parsing ist fragil.** HTML-Strukturen ändern sich; `web_fetch` liefert dann wenig Strukturiertes. Lesbarkeit der Ergebnisse kritisch prüfen, bei Unklarheit beim User rückfragen statt halluzinieren.
- **Jooble-Hardlimit (500/Monat).** Nur als Fallback, nicht als Default. Bei Query-Boost Oliver informieren.
- **Ausbildung ≠ Stelle.** `jobsuche_search` und `ausbildung_search` nicht verwechseln — BA trennt beide Register strikt.
- **Veröffentlichungsdatum nicht per Default filtern.** Solange eine Anzeige noch aktiv in der BA-Jobbörse steht, ist sie auch offen. Alter ist kein K.-o.-Kriterium — bei Engpassberufen sind auch ältere Anzeigen typischerweise noch besetzbar. Nur filtern, wenn explizit „neue Stellen" o. Ä. verlangt wird.
- **Kontakt-Wege unterschiedlich.** Manche BA-Anzeigen haben direkten Arbeitgeber-Kontakt, andere gehen nur über die BA-Vermittlungsfachkraft. Bei Klient:innen-Übergabe klar kommunizieren, welcher Weg gemeint ist.

## Ausgabeformat

Immer strukturiert. Default-Template:

```
### Top-Treffer

1. [Stellentitel]
   Arbeitgeber: ...
   Ort: ...
   Arbeitszeit: ...
   Bewerbung: [E-Mail / BA-Vermittlung / Link]
   Veröffentlicht: [Datum]
   Quelle: BA-Jobbörse (Ref-Nr. ...) / Karriereseite [URL] / Jooble
   Passung (bei Matching): ...

2. ...
```

Bei angenommenen Vorschlägen optional **nach Arbeitgebertyp gruppiert** (öffentlicher Dienst / kirchlich / privat), wenn das der Übersicht dient.

## Grundsätze

1. **BA zuerst, Vorschläge fallbezogen, Jooble als Fallback.** Nicht reflexhaft alles parallel abfragen, sondern gezielt nach erster BA-Sichtung entscheiden, welche Zusatzquellen für diesen konkreten Fall Mehrwert bringen.
2. **Vorschläge immer begründen.** Arbeitgeber-Vorschläge nicht nur auflisten, sondern kurz erklären, warum sie für den Fall relevant sein könnten. Der Nutzer entscheidet.
3. **Quellenangabe Pflicht.** Jeder Treffer mit Quellenvermerk (BA-Referenznummer / Karriereseiten-URL / Jooble) und — wenn zutreffend — Dedupe-Hinweis.
4. **Keine PII in Queries.** Gilt für Beratungskontext und privat.
5. **Matching transparent machen.** Was passt, was ist offen, was ist ein K.-o.-Kriterium.
6. **Kein Auto-Übergang zum Bewerbungs-Skill.** Der Skill endet mit der Stellenliste. Anschreiben/Lebenslauf benötigen einen separaten Aufruf des `bewerbungs-skill` durch den Nutzer.
7. **Regional-Preset ist austauschbar.** Die Arbeitgeberliste in `references/arbeitgeber-regional-aachen.md` ist Aachen-spezifisch. Bei anderer Region: entweder eigenes Preset anlegen oder ohne Vorschläge nur Workflow A/B.
