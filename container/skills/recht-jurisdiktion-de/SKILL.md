---
name: recht-jurisdiktion-de
description: "Bestimmung von Rechtsweg, Gerichtsbarkeit und Zuständigkeit im deutschen Recht: welche Gerichtsbarkeit (Sozial-, Verwaltungs-, Arbeits-, ordentliche), welche Instanz, Bund vs. Land, sowie die kirchliche Gerichtsbarkeit (KAGO, Einigungsstelle) im MAV-Bereich. Nutze diesen Skill, wenn geklärt werden muss 'welches Gericht ist zuständig', 'welcher Rechtsweg', 'wo klagt man', 'welche Behörde entscheidet', 'Widerspruch oder Klage', oder bei der Wahl des richtigen Gerichtsfilters für die Recherche (filter_court). NICHT für die inhaltliche Rechtsfrage selbst."
---

# Rechtsweg und Zuständigkeit (DE)

Du bestimmst, in welcher Gerichtsbarkeit und auf welcher Ebene eine Sache verhandelt wird —
damit Recherche und Beratung am richtigen Forum ansetzen. Das steuert auch den `filter_court`
bei `neuris_search` und die Wahl zwischen `neuris_search` (nur Bundesgerichte) und `old_search`
(auch LSG/LAG/SG/VG).

## Gerichtsbarkeiten nach Rechtsgebiet

| Rechtsgebiet (Olivers Domänen) | Gerichtsbarkeit | Instanzen | Verfahrensrecht |
|--------------------------------|-----------------|-----------|------------------|
| Sozialrecht (SGB II/VIII/XII), Asylbewerberleistungen | **Sozialgerichtsbarkeit** | SG → LSG → BSG | SGG |
| Aufenthalts-/Asylrecht, Ausländerbehörde, BAMF | **Verwaltungsgerichtsbarkeit** | VG → OVG/VGH → BVerwG | VwGO |
| Allgemeines Arbeitsrecht (Kündigung, Vertrag) | **Arbeitsgerichtsbarkeit** | ArbG → LAG → BAG | ArbGG |
| Kirchliches Arbeitsrecht / MAV-Streitigkeiten | **Kirchliche Gerichtsbarkeit** (s.u.) | Einigungsstelle / KAGO | MAVO + KAGO |
| Zivilrecht, Mietrecht | ordentliche Gerichtsbarkeit | AG/LG → OLG → BGH | ZPO |

## Behördenebene vor Gericht

Viele JMD-Fälle entscheiden sich auf Behördenebene, bevor ein Gericht ins Spiel kommt:
- **Ausländerbehörde** (Aufenthaltstitel, Duldung) → Widerspruch (soweit vorgesehen) / Klage vor dem VG
- **BAMF** (Asyl) → Klage vor dem VG, kurze Fristen beachten (⚠️ Frist im Bescheid prüfen)
- **Jobcenter / Sozialamt** (SGB II/XII) → Widerspruch → Klage vor dem SG
- **Jugendamt** (SGB VIII, z.B. Hilfe für unbegleitete Minderjährige) → Widerspruch → VG (Achtung: SGB VIII ist materiell Sozialrecht, prozessual aber **Verwaltungsgerichtsbarkeit**)

> ⚠️ **Fristen** sind in diesen Verfahren oft kurz (Wochen). Bei jedem konkreten Fall die im
> Bescheid genannte Rechtsbehelfsfrist zuerst prüfen — vor jeder inhaltlichen Recherche.

## Kirchliche Gerichtsbarkeit (MAV-Domäne)

- **Mitbestimmungsstreit MAV ↔ Dienstgeber:** Zunächst Einigungsstelle nach MAVO; danach
  kirchliche Arbeitsgerichtsbarkeit (**KAGG/KAGO** — Kirchliches Arbeitsgericht erster Instanz,
  Kirchengerichtshof der EKD bzw. für die kath. Kirche der KAGO-Rechtsweg).
- Staatliche Arbeitsgerichte sind für innerkirchliche MAV-Streitigkeiten regelmäßig **nicht**
  zuständig (Selbstbestimmungsrecht der Kirchen, Art. 140 GG i.V.m. Art. 137 WRV).
- Individualarbeitsrecht eines kirchlichen Beschäftigten (z.B. Kündigungsschutzklage) läuft
  dagegen vor dem **staatlichen** Arbeitsgericht — AVR als Vertragsinhalt.
- ⚠️ Die genaue Ausgestaltung des kirchlichen Rechtswegs für das Bistum Aachen über
  `search_documents_tool` (Collection `rechtsrecherche/mav`) verifizieren, nicht aus dem Gedächtnis.

## Auswirkung auf die Recherche

- **Bundesgericht gesucht?** → `neuris_search` mit `filter_court` (Werte via `neuris_courts`, z.B. `BSG Kassel`, `BAG Erfurt`, `BVerwG Leipzig`).
- **LSG / LAG / SG / VG / OVG?** → NeuRIS hat nur Bundesgerichte → `old_search` / `old_cases` nutzen.
- **EuGH** (Dublin, Freizügigkeit, Asyl) → `eurlex_eugh`.

## Grundsätze

1. **Forum vor Inhalt.** Falscher Rechtsweg = unzulässige Klage, egal wie gut die Begründung.
2. **Frist zuerst.** In behördlichen Verfahren ist die Rechtsbehelfsfrist der erste Prüfpunkt.
3. **Kirchlich ≠ staatlich.** MAV-Mitbestimmung läuft kirchlich, Individualkündigung staatlich.
4. Zuständigkeitsfragen mit Ermessens-/Streitpotenzial belegen, nicht behaupten (Norm → Beleg).
