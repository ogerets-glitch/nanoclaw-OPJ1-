---
name: standort-und-verkehr
description: >
  Aktueller Standort, ÖPNV-Verbindungen, Live-Abfahrten, Wetter, POIs in der
  Nähe und Standort-Verlauf für Oliver. Datenquelle ist der location-service
  MCP (intern: "location-oliver"), gespeist aus Olivers OwnTracks-App und
  Telegram-Standort-Sharing. Nutze diesen Skill bei Anfragen wie "wo bin
  ich", "wie komme ich nach X", "wann fährt der nächste Bus / die nächste
  Bahn", "was ist in der Nähe", "wie wird das Wetter heute", "wo war ich
  letzte Woche", oder bei Routing-/Pendlerfragen mit aktuellem Standort als
  Ausgangspunkt. NICHT bei: allgemeinen Wetterfragen ohne Standortbezug,
  Stellensuche (→ jobsuche), allgemeinen Statistiken (→ statistik). Wenn
  ein Tool 404/leer liefert, ist meist kein aktueller Standort hinterlegt
  — dem User mitteilen, nicht halluzinieren.
---

# Standort und Verkehr

Skill für alles rund um Olivers aktuellen Standort: Wo ist er, wie kommt er von dort weiter, was ist in der Nähe, wie wird das Wetter, wo war er. Quelle ist der `location-service` MCP-Server auf dem VPS — er bündelt mehrere externe APIs hinter einer einheitlichen Tool-Schicht.

## Tools (7)

| Tool | Funktion | Default-Parameter |
|------|----------|-------------------|
| `location_current` | Aktueller Standort + Adresse (roh, minimal). | — |
| `location_context` | **Sammel-Bundle:** Standort + Adresse + 3 nächste Haltestellen + Wetter + POIs im 500-m-Umkreis. Ein Tool, ein Aufruf. | — |
| `location_nearby` | POIs in der Nähe, gefiltert nach Kategorie. | `radius_m=500`, `limit=20`, `categories=None` |
| `location_departures` | Live-Abfahrten (Echtzeit). Ohne `station`-Argument: nächstgelegene Haltestelle, **AVV-HAFAS + DB-HAFAS gemerged**. Mit explizitem `station` nur **eine** Quelle — siehe Warnung unten. | `limit=10`, `station=None` |
| `location_trip_plan` | Nächste Verbindungen vom aktuellen Standort zum Ziel. Ziel als Stationsname **oder** Adresse. | `results=3`, `when=None` (= jetzt) |
| `location_weather` | Aktuelles Wetter + Tagesvorhersage. | — |
| `location_history` | Standort-Verlauf (älter zuerst kürzbar). | `limit=50`, `since=None` |

### `location_nearby` — gültige `categories`

`food`, `transport`, `health`, `shopping`, `services`, `leisure`, `tourism`, `education`. Mehrere zugleich als Liste, z.B. `["food", "shopping"]`. Kein Filter = alles.

### `location_trip_plan` — `when`-Parameter

ISO-8601 mit Zeitzone, z.B. `"2026-04-30T07:30:00+02:00"` für Verbindungen ab Mittwoch 7:30. Ohne `when`: ab jetzt.

### `location_departures` — `station=None` ist nicht nur "Default", sondern wichtig

Bei `station=None` (Auto-Modus, live-Position) fragt der Server **AVV-HAFAS und DB-HAFAS parallel** ab und mergt die Ergebnisse. Sobald ein Stationsname oder eine Stop-ID explizit übergeben wird, läuft nur **eine** Quelle:

- DB-Stop-ID (z.B. `8000001` Aachen Hbf) → nur DB-HAFAS
- AVV-Stationsname → nur AVV-HAFAS

**Konsequenz:** Lokale Bus-Linien der ASEAG (SB66 Brand↔Monschau, 22, 25, 47 etc.) liegen ausschließlich in AVV-HAFAS. Wenn der Bot eine DB-Station übergibt — oder einen Stationsnamen, den DB-HAFAS auflöst, AVV aber besser kennt — fallen die ASEAG-Linien aus der Antwort, und Oliver kriegt eine zu kurze Liste, ohne dass das im Output sichtbar wird.

**Faustregel:** Wenn Olivers aktuelle Position passt, **`station=None` lassen** und auf den Merge vertrauen. Eine Station nur explizit übergeben, wenn er gezielt nach einer entfernten Haltestelle fragt — und dann **AVV-Stop-IDs bevorzugen** für Aachen-/Eifel-Region (Liste in OpenBrain #417 für die häufigsten Knoten: Brand `1127`, Bushof Aachen `1063`, Imgenbroich `4788`, Monschau Altstadt `4867`).

## Typische Anfragen → Tool-Mapping

| Anfrage | Tool | Hinweis |
|---------|------|---------|
| "Wo bin ich gerade?" | `location_current` | Wenn nur die Adresse gefragt ist |
| "Was ist los um mich herum?" | `location_context` | Bundle, ein Aufruf statt vier |
| "Wann fährt mein Bus?" | `location_departures` | Default = nächste Haltestelle |
| "Wann fährt der Bus an Haltestelle X?" | `location_departures` mit `station="X"` | **Achtung: Merge wird deaktiviert** — nur AVV oder nur DB. ASEAG-Linien fehlen ggf. Wenn Oliver an X steht, lieber `station=None`. Für Aachen-/Eifel-Knoten AVV-Stop-IDs aus #417 bevorzugen. |
| "Wie komme ich nach Köln?" | `location_trip_plan` mit `to="Köln Hbf"` | Bahnhofsname oder Adresse |
| "Wie komme ich morgen früh um 7 zu Caritas?" | `location_trip_plan` mit `to`, `when` | `when` als ISO-8601 mit `+02:00` |
| "Wo gibts hier ein Café?" | `location_nearby` mit `categories=["food"]` | ggf. `radius_m` erhöhen wenn leer |
| "Wo gibts eine Apotheke?" | `location_nearby` mit `categories=["health"]` | |
| "Wie wird das Wetter heute?" | `location_weather` | Tagesvorhersage inklusive |
| "Wo war ich gestern?" | `location_history` mit `since="2026-04-28T00:00:00+02:00"` | |
| "Wo war ich die letzten 24 Stunden?" | `location_history` ohne `since`, dann nach Timestamp filtern | |

**Faustregel:** Bei breiten Fragen (Standort + Drumherum) **erst `location_context`** — das spart drei einzelne Tool-Calls. Erst nachschärfen, wenn der User mehr Details will.

## Datenquellen (zum Verstehen, nicht zum Erklären)

Der MCP-Server bündelt diese externen Quellen:

| Schicht | Quelle |
|---------|--------|
| Standort-Tracking | OwnTracks-App (primär) + Telegram-Standort-Sharing (manuell) |
| Adress-Lookup | Nominatim (OpenStreetMap) |
| ÖPNV-Verbund Aachen | AVV-HAFAS (Verkehrsverbund Aachen) |
| Fern-/Regionalverkehr | DB-rest (Deutsche Bahn Open Data) |
| POIs / Sehenswürdigkeiten | Overpass (OpenStreetMap) |
| Wetter | open-meteo |

**Konsequenzen:**
- ÖPNV-Live-Daten sind in der **AVV-Region (Aachen + StädteRegion + Umfeld)** am dichtesten. Außerhalb fällt es auf reine DB-Daten zurück (Fernverkehr, Regionalbahn, kein Stadtbus).
- Für `trip_plan` weite Strecken → meist DB; im Aachen-Stadtgebiet → AVV.
- POIs kommen aus OSM — Aktualität schwankt, manche kleinen Geschäfte fehlen.

## Region und Grenzen

- **Aachen + StädteRegion:** voller Funktionsumfang inkl. Stadtbus.
- **NRW + grenznah:** ÖPNV via DB / lokale Verbünde, je nach Datenlage lückiger.
- **Außerhalb Deutschland:** Standort und Wetter ja, ÖPNV nur eingeschränkt (DB endet an der Grenze; AVV reicht bis Vaals/Maastricht-Umfeld).

## Wenn ein Tool ins Leere läuft

| Symptom | Wahrscheinliche Ursache | Was tun |
|---------|--------------------------|---------|
| 404 / "kein Standort" | OwnTracks pausiert, Handy aus, Telegram-Standort abgelaufen | User informieren — nicht halluzinieren, nicht den letzten History-Eintrag als „aktuell" verkaufen |
| Leere Abfahrtsliste an gültiger Haltestelle | Spät nachts, Betriebspause, Streik | User mit Hinweis melden; ggf. `location_trip_plan` für Alternativen |
| `trip_plan` findet Ziel nicht | Tippfehler im Stationsnamen, mehrdeutige Adresse | Mit präziserem `to` retrien (z.B. „Köln Hbf" statt „Köln") |
| 5xx Upstream-Fehler | DB-rest oder AVV-HAFAS gerade down | Beim nächsten Versuch erneut probieren, dem User offen kommunizieren |

## Datenschutz

- Der Standort ist **Olivers privater Standort**. Niemals in externe Tools (z.B. Claude.ai-Chat-Snippets, Issue-Tracker, Cloud-Dokumente) leaken.
- Der Skill darf in Bot-Antworten Standort-Informationen verwenden — Oliver hat den Bot bewusst auf diesen Datenfluss konfiguriert. Aber **keine Standort-Daten an Dritte** (z.B. wenn der Bot in einer Gruppe antwortet, in der nicht nur Oliver ist).
- `location_history` ist sensitiv — Zugriff nur, wenn Oliver explizit nach Verlauf fragt, nicht reflexhaft.

## Grundsätze

1. **Bundle vor Einzeltools.** Bei breiten Fragen `location_context` zuerst, statt drei einzelne Calls zu machen.
2. **Standort kann fehlen.** Tools liefern dann 404 / leer — das ehrlich zurückmelden, nicht den letzten History-Eintrag als gegenwärtig ausgeben.
3. **Region kennen.** AVV = Aachen-Land, sonst DB-only. Bei Fragen außerhalb der Region nicht mit Stadtbus-Versprechen antworten.
4. **Datenquellen nicht reflexhaft erklären.** Wenn der User fragt „wann fährt mein Bus", interessiert ihn nicht, dass das via AVV-HAFAS geht. Quelle nur erwähnen, wenn relevant (z.B. wenn das Tool Fehler liefert und der Hinweis auf die Upstream-API nützlich ist).
5. **Privatsphäre.** Standort und Verlauf sind Olivers private Daten. Nicht weiterleiten, nicht in externe Logs.
