---
name: datenschutz-routing
description: "Erkennung und Schutz personenbezogener und besonders sensibler Daten (Sozialdaten, Gesundheitsdaten, Asyl-/Migrationsstatus) VOR jeder Übermittlung an einen Cloud-Dienst oder eine Suchanfrage. Nutze diesen Skill, wenn Klienten- oder Beschäftigtendaten im Spiel sein könnten — bei Fall-Schilderungen mit Namen, Geburtsdaten, Aktenzeichen, Adressen; vor dem Absetzen von Rechtsrecherche-Anfragen mit konkretem Sachverhalt; beim Erstellen von Memos/Stellungnahmen aus echten Fällen; oder wenn gefragt wird 'darf ich das so schicken', 'muss ich das anonymisieren', 'ist das datenschutzkonform'. Rechtsrahmen: KDG (kirchlicher Datenschutz Caritas), Sozialgeheimnis (§ 35 SGB I, §§ 67–85a SGB X), § 203 StGB, DSGVO/BDSG. NICHT für allgemeine Rechtsfragen ohne Personenbezug."
---

# Datenschutz-Routing

Du schützt personenbezogene und besonders sensible Daten, bevor sie in eine Cloud-KI,
eine Suchanfrage oder ein extern gespeichertes Dokument gelangen. Grundregel von Olivers
Arbeitsweise: **Rechtsrecherche läuft anonymisiert** — keine Klientendaten in Tool-Queries.
Dieser Skill macht aus diesem Grundsatz eine bewusste Prüfung vor jedem Egress.

## Warum das hier besonders streng gilt

Oliver verarbeitet Daten realer, oft vulnerabler Menschen (junge Migrant*innen im JMD,
Beschäftigte in MAV-Fällen). Ein Leak hätte reale Folgen. Mehrere Rechtsregime greifen
gleichzeitig — Verstöße sind teils **strafbewehrt**:

| Regime | Gilt für | Besonderheit |
|--------|----------|--------------|
| **KDG** (Gesetz über den Kirchlichen Datenschutz) | Caritas/Bistum Aachen als kirchlicher Träger | Hauptregime bei Caritas — **nicht** DSGVO. Eigene Aufsicht (KDSA West). |
| **Sozialgeheimnis** § 35 SGB I, §§ 67–85a SGB X | JMD-Klientendaten (Sozialdaten) | Eigener Schutzstandard für Sozialdaten, enge Übermittlungsschranken. |
| **§ 203 StGB** | Berufsgeheimnisträger / anvertraute Geheimnisse | **Strafbar** bei unbefugter Offenbarung. |
| **DSGVO Art. 9 / BDSG** | personenbezogene Daten allgemein, besondere Kategorien | Gesundheit, Religion, ethnische Herkunft, Asyl = besondere Kategorie. |

## Datenklassen

### ROT — niemals ungefiltert nach außen
Direkt identifizierende Daten einer realen Person in Kombination mit Fall-/Statusinformation:
- Klar- oder Nachnamen von Klient*innen/Beschäftigten
- Geburtsdatum, Geburtsort
- Anschrift, konkrete Wohnadresse
- Aktenzeichen (Ausländerbehörde, BAMF-Az., Gerichts-Az. eines konkreten Falls), BAMF-/AZR-Nummer
- Gesundheitsangaben, psychische Verfassung
- konkreter Asyl-/Aufenthaltsstatus einer benannten Person
- Personalnummer, konkrete Dienststelle + Person

### GELB — nur mit Bedacht, im Zweifel anonymisieren
- Sammlungen mehrerer Quasi-Identifikatoren (Alter + Herkunftsland + Ankunftsdatum + Ort), die zusammen re-identifizieren
- interne Vermerke mit „vertraulich", „persönlich", „nicht zur Weitergabe"
- Firmen-/Trägername in Verbindung mit einem konkreten Beschäftigtenfall

### GRÜN — frei recherchierbar
- abstrakte Rechtsfragen ohne Personenbezug („Voraussetzungen § 25a AufenthG", „Mitbestimmung Dienstplan MAVO")
- Gesetzes-, Urteils-, Kommentar-Suche
- anonymisierte Fallkonstellationen („eine 17-jährige Person mit Duldung, seit 3 Jahren in DE …")

## Vorgehen vor jeder Übermittlung

1. **Scannen.** Enthält der Text, der an MCP-Tool / Web / externes Dokument geht, ROT-Marker?
2. **Bei ROT:** Stoppen. Oliver hinweisen und anonymisieren — bevor die Anfrage rausgeht.
3. **Anonymisieren statt löschen:** Den Fall in eine abstrakte Konstellation überführen, die für die Recherche ausreicht:
   - Name → „die betroffene Person", „der/die Beschäftigte"
   - konkretes Datum → relative Angabe („seit ca. 3 Jahren", „Einreise 2021")
   - Aktenzeichen → weglassen (für die Rechtsfrage irrelevant)
   - Ort → nur Bundesland/Region, wenn rechtlich relevant (Zuständigkeit), sonst weglassen
   - Herkunftsland → nur wenn rechtlich relevant (z.B. sichere Herkunftsstaaten, Visumfreiheit)
4. **Prüfen, ob die Anonymisierung die Rechtsfrage trägt.** Meist ja — die Rechtslage hängt an Status, Fristen und Tatbestandsmerkmalen, nicht am Namen.
5. **Dokumentieren:** Im Memo kann mit Platzhaltern gearbeitet werden ([NAME], [AZ]), die Oliver lokal befüllt.

## Zusammenspiel mit dem Datenschutz-Hook

Dieses Plugin enthält einen `PreToolUse`-Hook (`hooks/datenschutz-check.js`), der ROT-Marker
automatisch erkennt und je nach `privacy_mode` (balanced/strict/cloud) nachfragt oder blockt.
Der Hook ist das technische Sicherheitsnetz; dieser Skill ist die inhaltliche Anleitung. Verlasse
dich nicht allein auf den Hook — Mustererkennung kann Klarnamen ohne Kontext übersehen.

## Grundsätze

1. **Anonymisierung ist der Normalfall, nicht die Ausnahme.** Die Recherche braucht die Identität nie.
2. **Im Zweifel GELB wie ROT behandeln.** Lieber einmal zu viel anonymisiert.
3. **OpenBrain-Memory:** Recherche-Ergebnisse, die in OpenBrain abgelegt werden, dürfen ebenfalls keine ROT-Daten enthalten — nur abstrahierte Rechtslagen.
4. **Urheberrechtlich geschützte Kommentar-Exzerpte** (aus OpenBrain) nicht an Dritte weitergeben — nur interne Arbeitsgrundlage.
