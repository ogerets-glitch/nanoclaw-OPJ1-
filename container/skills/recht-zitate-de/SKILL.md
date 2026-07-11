---
name: recht-zitate-de
description: "Korrekte deutsche Rechtszitate: Gesetze (§/Art. mit amtlicher Abkürzung), Gerichtsentscheidungen (BVerfG, BVerwG, BSG, BAG, BGH, LSG, OVG, LAG, VG, SG) mit Gericht + Datum + Aktenzeichen, EU-Recht (Verordnungen/Richtlinien, CELEX) und EuGH-Urteile. Nutze diesen Skill beim Formatieren, Prüfen oder Vereinheitlichen von Fundstellen in Memos und Stellungnahmen, beim Übernehmen von Treffern aus dem Rechtsrecherche-MCP in einen Text, oder wenn gefragt wird 'wie zitiere ich das richtig', 'stimmt das Aktenzeichen', 'formatier die Quellen'. NICHT für die Recherche selbst (→ rechtsrecherche-Skill)."
---

# Deutsche Rechtszitate

Du sorgst dafür, dass jede Fundstelle nachprüfbar und nach deutscher Konvention zitiert ist.
Leitsatz aus dem `rechtsrecherche`-Skill: **Jedes zitierte Urteil braucht Gericht + Datum +
Aktenzeichen — sonst ist es wertlos.** Erfinde nie ein Aktenzeichen; fehlt es, kennzeichne
„⚠️ Fundstelle zu prüfen".

## Gesetze und Verordnungen

Format: `§ <Nr> Abs. <n> [Satz <n>] [Nr. <n>] <Gesetzeskürzel>` bzw. bei Artikeln `Art. <Nr> …`.

- Paragraphenzeichen `§` (Plural `§§`), bei EU-/Verfassungsrecht `Art.`
- Amtliche Abkürzung ohne Punkt im Kürzel: `AufenthG`, `AsylG`, `SGB VIII`, `BetrVG`, `KSchG`, `BGB`, `GG`, `MAVO`, `AVR`
- SGB immer mit römischer Ziffer: `§ 35 SGB I`, `§ 67 SGB X`, `§ 16 SGB II`
- Beispiele: `§ 25a Abs. 1 AufenthG`, `Art. 16a GG`, `§ 33 MAVO`, `Art. 6 Abs. 1 DSGVO`

**Kirchliches Recht kennzeichnen:** `MAVO` (Rahmenordnung) bzw. die diözesane Fassung des
Bistums Aachen; `AVR` (Richtlinien der Arbeitsvertragsrichtlinien des Deutschen Caritasverbandes);
`KDG` (kirchlicher Datenschutz). Diese sind **Diözesan-/Kirchenrecht**, kein Bundesrecht — im
Text nicht mit staatlichem Recht vermischen (vgl. `rechtsrecherche`-Skill, Grundsatz 2).

## Gerichtsentscheidungen

Format: `<Gericht>, Urteil/Beschluss v. <TT.MM.JJJJ> – <Aktenzeichen>` (+ Fundstelle/Rn., wenn vorhanden).

| Gericht | Kürzel | Az.-Muster (Beispiel) |
|---------|--------|------------------------|
| Bundesverfassungsgericht | BVerfG | 1 BvR 1234/20 |
| Bundesverwaltungsgericht | BVerwG | 1 C 12.19 |
| Bundessozialgericht | BSG | B 4 AS 12/20 R |
| Bundesarbeitsgericht | BAG | 7 AZR 99/19 |
| Bundesgerichtshof | BGH | VIII ZR 12/20 |
| Landessozialgericht | LSG | (landesspezifisch) |
| Oberverwaltungsgericht / VGH | OVG / VGH | (landesspezifisch) |
| Landesarbeitsgericht | LAG | (landesspezifisch) |
| Verwaltungsgericht | VG | (ortsspezifisch) |
| Sozialgericht | SG | (ortsspezifisch) |

- Datum aus `neuris_case_law_get` / `old_cases` übernehmen, nicht schätzen.
- `html_url` aus NeuRIS-Treffern als Link mitgeben (Nachprüfbarkeit).
- ECLI angeben, wenn vorhanden (`old_cases` liefert sie).
- Bei BAG-Analogie zur MAVO: kennzeichnen, dass BAG-Rechtsprechung zum BetrVG *analog* herangezogen wird.

## EU-Recht und EuGH

- Verordnung/Richtlinie: voller Titel oder gängige Kurzform + Nummer, z.B. `Verordnung (EU) 2024/1348 (Asylverfahrens-VO)`, `Dublin-III-VO (VO (EU) 604/2013)`.
- CELEX-Nummer aus `eurlex_lookup` mitführen, wenn vorhanden.
- EuGH: `EuGH, Urteil v. <Datum> – C-<nr>/<jahr>` (Gerichtshof) bzw. `EuG – T-<nr>/<jahr>` (Gericht). Aktenzeichen aus `eurlex_eugh`.
- Bei GEAS-Reform: Übergangsstand kennzeichnen (`gilt_ab`/`loest_ab` aus `eurlex_lookup`), weil alte und neue Fassung parallel relevant sein können.

## Aktualität

- Vor dem Zitieren einer Norm `in_force`-Status prüfen (`neuris_legislation_get`) oder Fassung über `gii_lookup` gegenchecken.
- Nicht verifizierte Fundstellen mit „⚠️ zu prüfen" markieren — nie glätten.

## Häufige Fehler

- ❌ Aktenzeichen oder Datum schätzen → immer aus dem Tool-Treffer übernehmen.
- ❌ MAVO/AVR wie Bundesrecht zitieren ohne Kennzeichnung als Kirchenrecht.
- ❌ SGB ohne römische Ziffer.
- ❌ EuGH-Urteil ohne C-/T-Aktenzeichen.
