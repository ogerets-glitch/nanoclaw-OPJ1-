# Regionale Arbeitgeber Aachen / StädteRegion + Umkreis

Kuratierte Liste als **Nachschlagewerk für Arbeitgeber-Vorschläge** im `jobsuche`-Skill. Nach der BA-Breitensuche wählt der Skill aus dieser Liste kontextspezifisch 3–5 Arbeitgeber aus, deren Karriereseiten für die konkrete Anfrage zusätzlich sinnvoll sein könnten, und legt sie dem Nutzer zur Entscheidung vor.

## Pflege-Hinweise

- **URLs können sich ändern.** Bei HTTP 404 oder leerem `web_fetch`-Ergebnis: Fallback über `web_search` nach `"[Arbeitgeber] Karriere"` oder `"[Arbeitgeber] Stellenangebote"`.
- **BA-Arbeitgebername variiert.** In der BA-Jobbörse wird der offizielle Vereins-/Firmenname genutzt, der oft länger ist (z.B. „Caritasverband für die Region Aachen e.V." statt „Caritas Aachen"). Bei `jobsuche_search` mit Arbeitgeber-Filter mehrere Schreibweisen versuchen oder breit suchen und nachfiltern.
- **Liste ist erweiterbar.** Ergänzungen hier eintragen, nicht in SKILL.md.

---

## Öffentlicher Dienst — Kommunen

### Stadt Aachen
- BA-Suchname: `Stadt Aachen`
- Karriereportal: prüfen unter `aachen.de` → Stellenangebote
- Typische Bereiche: Verwaltung, Kitas (Städt. Kindertagesstätten), Feuerwehr, Bauhof, Ordnungsamt

### StädteRegion Aachen
- BA-Suchname: `StädteRegion Aachen`
- Karriereportal: prüfen unter `staedteregion-aachen.de` → Karriere
- Typische Bereiche: Jugendamt, Sozialamt, Jobcenter, Gesundheitsamt, Ausländerbehörde

### Stadt Düren
- BA-Suchname: `Stadt Düren`
- Karriereportal: prüfen unter `dueren.de`

### Kreis Düren
- BA-Suchname: `Kreis Düren`
- Karriereportal: prüfen unter `kreis-dueren.de`

### Kreis Heinsberg
- BA-Suchname: `Kreis Heinsberg`
- Karriereportal: prüfen unter `kreis-heinsberg.de`

### Kreis Euskirchen
- BA-Suchname: `Kreis Euskirchen`
- Karriereportal: prüfen unter `kreis-euskirchen.de`

### Stadt Jülich
- BA-Suchname: `Stadt Jülich`

---

## Land / Bund / Forschung

### Land NRW (zentrales Portal)
- BA-Suchname: je nach Ressort — meist direkt über Landesportal
- Karriereportal: `karriere.nrw`

### Forschungszentrum Jülich
- BA-Suchname: `Forschungszentrum Jülich`
- Karriereportal: prüfen unter `fz-juelich.de` → Karriere
- Typische Bereiche: Wissenschaft, IT, Technik, Verwaltung; großer Arbeitgeber im Umkreis

### Bundesagentur für Arbeit (als Arbeitgeber)
- BA-Suchname: `Bundesagentur für Arbeit`
- Typische Bereiche: Agenturen, Jobcenter, Familienkasse

### Bundeswehr (Standort Aachen / Umkreis)
- BA-Suchname: `Bundeswehr`
- Karriereportal: `bundeswehrkarriere.de`

---

## Kirchlich / Diakonisch / Karitativ

### Bistum Aachen
- BA-Suchname: `Bistum Aachen`
- Karriereportal: prüfen unter `bistum-aachen.de` → Jobs / Stellenangebote
- Typische Bereiche: Pastoral, Verwaltung, Schulen, Bildungswerke
- **Hinweis:** Bistum meldet oft lückenhaft an BA — `web_fetch` auf Karriereseite ist hier besonders wichtig.

### Caritasverband für die Region Aachen e.V. (Olivers Arbeitgeber)
- BA-Suchname: `Caritasverband` oder `Caritas Aachen` (mehrere Schreibweisen!)
- Karriereportal: prüfen unter `caritas-aachen.de` bzw. `cv-aachen.de`
- Typische Bereiche: Migrationsberatung, Kitas, Altenpflege, Sozialberatung, Schuldnerberatung

### Weitere Caritasverbände im Umkreis
- Caritasverband Düren-Jülich
- Caritasverband Heinsberg
- Caritasverband Eifel
- BA-Suchname: jeweils `Caritasverband [Region]`

### Diakonisches Werk im Kirchenkreis Aachen
- BA-Suchname: `Diakonie Aachen` oder `Diakonisches Werk Aachen`
- Karriereportal: prüfen unter `diakonie-aachen.de`

### Malteser Hilfsdienst (Region Aachen)
- BA-Suchname: `Malteser`
- Karriereportal: `malteser.de/jobs`

### Katholische Schulen / Schulstiftungen (Bistum Aachen)
- BA-Suchname: `katholische Schule` + Ort oder konkrete Schulnamen (z.B. „Bischöfliche Marienschule")
- Hinweis: Oft eigenständige Schulstiftungen als Träger; BA-Meldung lückenhaft

---

## Gesundheit — Kliniken

### Uniklinik RWTH Aachen (UKA)
- BA-Suchname: `Universitätsklinikum Aachen` oder `Uniklinik RWTH Aachen`
- Karriereportal: prüfen unter `ukaachen.de` → Karriere
- Einer der größten Arbeitgeber der Region; Pflege, Medizin, Technik, Verwaltung

### Alexianer Aachen / Alexianer Krankenhaus
- BA-Suchname: `Alexianer`
- Karriereportal: prüfen unter `alexianer.de`
- Psychiatrie, Akutmedizin

### Luisenhospital Aachen
- BA-Suchname: `Luisenhospital`
- Karriereportal: prüfen unter `luisenhospital.de`

### Marienhospital Aachen
- BA-Suchname: `Marienhospital Aachen`

### Krankenhaus Düren / Marienhospital Düren
- BA-Suchname: `Krankenhaus Düren`, `Marienhospital Düren`

### LVR-Klinik Düren
- BA-Suchname: `LVR-Klinik`

---

## Wohlfahrtsverbände

### AWO (Aachen / Niederrhein)
- BA-Suchname: `AWO`
- Karriereportale: verbandsabhängig — meist kreisweise

### DRK-Kreisverband Aachen
- BA-Suchname: `DRK Aachen` oder `Deutsches Rotes Kreuz Aachen`
- Karriereportal: prüfen unter `drk-aachen.de`

### Paritätischer Wohlfahrtsverband NRW
- BA-Suchname: `Paritätischer`
- Karriereportal: `paritaet-nrw.org`

---

## Hochschulen

### RWTH Aachen University
- BA-Suchname: `RWTH Aachen`
- Karriereportal: `rwth-aachen.de` → Stellenmarkt
- Typische Bereiche: Wissenschaft, Verwaltung, IT, Technik

### FH Aachen
- BA-Suchname: `FH Aachen` oder `Fachhochschule Aachen`
- Karriereportal: `fh-aachen.de` → Hochschule / Stellen

### Katholische Hochschule NRW, Abteilung Aachen
- BA-Suchname: `Katholische Hochschule NRW`
- Karriereportal: `katho-nrw.de`

---

## Privat — Großarbeitgeber der Aachener Region

### Grünenthal Pharma
- BA-Suchname: `Grünenthal`
- Karriereportal: `gruenenthal.com` → Careers
- Pharmaforschung, Produktion

### FEV Group (Automotive Engineering)
- BA-Suchname: `FEV`
- Karriereportal: `fev.com` → Careers
- Ingenieurswesen, Motorentwicklung

### STAWAG (Stadtwerke Aachen)
- BA-Suchname: `STAWAG` oder `Stadtwerke Aachen`
- Karriereportal: prüfen unter `stawag.de`

### Talbot Services (Bahntechnik Aachen)
- BA-Suchname: `Talbot`
- Schienenfahrzeugbau, Service

### Zentis (Düren, Umkreis)
- BA-Suchname: `Zentis`
- Lebensmittelproduktion (Fruchtzubereitungen)

### Lindt & Sprüngli (Aachen)
- BA-Suchname: `Lindt`
- Produktion, Logistik

### Ford-Werke / Ford Research (Aachen-Region)
- BA-Suchname: `Ford`
- Entwicklung, Forschung; Standorte in Aachen und Umkreis

---

## Priorisierung für Vorschläge

Der Skill schlägt dem Nutzer nicht alle Arbeitgeber vor, sondern wählt fallbezogen aus. Faustregel je Anfrage-Kontext:

| Anfrage-Kontext | Priorisierte Arbeitgeber |
|-----------------|--------------------------|
| Migrationsberatung / SGB-II-Klient:innen | Öffentlicher Dienst (Stadt, StädteRegion, Kreise), Wohlfahrt (Caritas, Diakonie, AWO, DRK), Bistum, UKA |
| Pflege / Gesundheit | Alle Kliniken, Caritas, Diakonie, AWO-Pflege, UKA |
| Erziehung / Kita | Stadt Aachen, StädteRegion, Bistum, Caritas, Diakonie, AWO |
| IT / Technik / Ingenieurwesen | RWTH, FH, Forschungszentrum Jülich, FEV, Grünenthal, STAWAG, Ford |
| Verwaltung / Büro | Öffentlicher Dienst allgemein, Hochschulen, Wohlfahrt |
| Ausbildungsplatz | Alle — Ausbildungsangebote sind breit verteilt |

Bei unklarem Kontext: 3–5 Arbeitgeber aus den jeweils passenden Kategorien vorschlagen, nicht alle. Private Großarbeitgeber nur wenn Berufsfeld klar passt (IT, Technik, Produktion, Pharma).
