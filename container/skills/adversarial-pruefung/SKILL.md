---
name: adversarial-pruefung
description: "Drei-Rollen-Gegenprüfung einer Rechtsauskunft gegen Halluzination und einseitige Auslegung: Advocate baut die Position auf, Adversary greift sie systematisch an (Gegen-Normen, Gegen-Urteile, Analogie-Brüche, fehlende Belege), Judicial wägt neutral ab und gibt eine begründete Einschätzung mit Wahrscheinlichkeit. Nutze diesen Skill, wenn eine Rechtsauffassung abgesichert werden soll, bei kontroversen/nicht offensichtlichen Fragen, vor einer Stellungnahme/einem Memo mit Außenwirkung, oder wenn gefragt wird 'ist das wirklich so', 'gibt es Gegenargumente', 'prüf das kritisch', 'stresstest'. Baut auf Schritt 4b des rechtsrecherche-Skills auf und vertieft ihn."
---

# Adversarial-Prüfung

Du sicherst eine Rechtsauskunft gegen die zwei häufigsten Fehler ab: **Halluzination**
(erfundene oder falsch erinnerte Fundstellen) und **einseitige Auslegung** (die erste
plausible Auffassung wird als „die Antwort" präsentiert). Das ist die ausgebaute Form von
Schritt 4b des `rechtsrecherche`-Skills — hier als eigenständiges, mehrrolliges Verfahren.

Anlass: Oliver hat dokumentierte Sorge vor Halluzination (z.B. erfundene Listen). In der
Rechtsberatung ist eine falsche, aber selbstsicher vorgetragene Auskunft gefährlicher als ein
ehrliches „dazu finde ich nichts".

## Ablauf

Die drei Rollen laufen nacheinander. Jede stützt sich **nur auf belegte Quellen** aus dem
Rechtsrecherche-MCP und OpenBrain — keine Rolle darf neue Fundstellen erfinden.

### 1. Advocate — die Position aufbauen
- Formuliere die stärkste Begründung für das vom Nutzer/aus der Recherche favorisierte Ergebnis.
- Jede tragende Aussage mit konkreter Fundstelle (Norm, Urteil, Kommentar) belegen.
- Argumentationsweg sichtbar machen: Normtext → Auslegung → Subsumtion → Ergebnis.

### 2. Adversary — die Position angreifen
Suche **aktiv** nach Schwächen — nicht nur prüfen, was zufällig schon gefunden wurde:
- **Gegen-Normen / Gegen-Urteile:** Gibt es eine vertretbare Auffassung zum gegenteiligen Ergebnis? Gezielt danach recherchieren (`neuris_search`, `old_search`, `eurlex_eugh`).
- **Quellenbasis:** Stützt sich die Position auf nur eine Quelle? Dann fragil — unabhängige Bestätigung verlangen (andere Quelle, andere Schicht: OpenBrain + NeuRIS belastbarer als zwei Chunks aus demselben Dokument).
- **Analogie-Brüche:** Bei BetrVG→MAVO-Analogie: Hat die MAVO an dieser Stelle eine bewusst abweichende Regelung? Dann greift die Analogie nicht (BAG wendet BetrVG nur bei echter Lücke analog an).
- **Halluzinations-Check:** Existiert jede zitierte Fundstelle wirklich? Aktenzeichen/ELI/CELEX über `*_get`-Tools bzw. `gii_lookup` gegenprüfen. Nicht verifizierbare Fundstelle → als „⚠️ nicht verifiziert" markieren, nicht verwenden.
- **Sachverhaltslücken:** Hängt das Ergebnis an unausgesprochenen Annahmen (Status, Frist, Tätigkeit)? Diese benennen.

### 3. Judicial — neutral abwägen
- Stelle Advocate- und Adversary-Position nebeneinander.
- Gewichte nach Quellenlage und Überzeugungskraft, nicht nach Reihenfolge.
- Ergebnis mit **Einschätzung der Belastbarkeit**: gesichert / überwiegend / offen / streitig.
- Wo es streitig bleibt: ausdrücklich sagen, dass beide Auffassungen vertretbar sind — nicht eigenständig „entscheiden" (vgl. `rechtsrecherche`-Skill, Schritt 5).
- Offene Sachverhaltsfragen, die das Ergebnis kippen könnten, klar auflisten.

## Output-Struktur

```
## Position (Advocate)
[Begründung mit Fundstellen, Argumentationsweg]

## Gegenprüfung (Adversary)
- Gegenargument 1 [Fundstelle / oder: keine Gegenquelle gefunden]
- Quellenbasis: [tragfähig / fragil]
- Analogie/Halluzinations-Check: [Ergebnis]
- Sachverhaltslücken: [...]

## Abwägung (Judicial)
Einschätzung: [gesichert / überwiegend / offen / streitig]
Begründung: [...]
Offene Punkte, die das Ergebnis ändern könnten: [...]
```

## Umsetzung je Umgebung

Das Verfahren ist dasselbe, der Mechanismus unterscheidet sich:

- **Claude Code:** Es gibt native Subagents (`recht-advocate`, `recht-adversary`, `recht-judicial`); der Command `/recht-adversarial` ruft sie nacheinander auf.
- **OPJ1 / NanoClaw:** Spawne pro Rolle einen **eigenständigen SDK-`Agent`** (stateless, einmalig) mit dem jeweiligen Rollen-Baustein unten als Auftrag. Wichtig: Der Adversary-Agent soll die Position **ohne** den Advocate-Gedankengang frisch angreifen — gerade die Kontext-Isolation eines separaten Agenten macht die Gegenprüfung wertvoll. (Für eine fall-übergreifende, dauerhafte Instanz wäre `create_agent` denkbar; für die fallweise Prüfung ist der stateless `Agent` richtig.)
- **Fallback (jede Umgebung):** Sind keine Subagents verfügbar, spiele die drei Rollen nacheinander selbst durch — als Denk-Disziplin, in derselben Reihenfolge.

## Rollen-Bausteine

Diese Prompts sind die gemeinsame Quelle für beide Umgebungen (in Claude Code zusätzlich als `agents/*.md` hinterlegt). Jede Rolle arbeitet anonymisiert (`datenschutz-routing`) und belegt jede Aussage über den Rechtsrecherche-MCP/OpenBrain.

**Advocate:** „Baue die stärkste belegbare Begründung für die Position auf. Stütze jede tragende Aussage auf eine konkrete, verifizierbare Fundstelle. Mache den Weg sichtbar: Normtext → Auslegung → Subsumtion → Ergebnis. Erfinde nichts; markiere selbst die angreifbaren Punkte."

**Adversary:** „Greife die Position ernsthaft an. Recherchiere aktiv Gegen-Normen/Gegen-Urteile (nicht nur das schon Gefundene prüfen). Prüfe die Quellenbasis (einzige Quelle = fragil), Analogie-Brüche (BetrVG↔MAVO nur bei echter Lücke), und verifiziere jede zitierte Fundstelle über die `*_get`-Tools — nicht Verifizierbares als ‚⚠️ nicht verifiziert' verwerfen. Benenne Sachverhaltslücken."

**Judicial:** „Wäge Advocate und Adversary neutral ab, nach Quellenlage statt Reihenfolge. Gib eine Einschätzung mit Belastbarkeitsgrad (gesichert/überwiegend/offen/streitig). Bleibt es streitig, sag das — entscheide strittige Fragen nicht eigenständig. Liste offene Punkte, die das Ergebnis kippen könnten."

## Grundsätze

1. **Keine Rolle erfindet Fundstellen.** Jede Quelle ist über ein MCP-Tool verifizierbar oder wird als unverifiziert gekennzeichnet.
2. **Der Adversary sucht echt** — eine Gegenprüfung, die nur die eigene These bestätigt, ist keine.
3. **Streitig bleiben dürfen.** Eine ehrlich offene Frage ist wertvoller als eine erzwungene Antwort.
4. **Menschliche Freigabe.** Das Ergebnis ist Arbeitsgrundlage; Oliver entscheidet über Verwendung.
