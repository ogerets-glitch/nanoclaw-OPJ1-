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

## Tools (8)

| Tool | Funktion | Default-Parameter |
|------|----------|-------------------|
| `location_current` | Aktueller Standort + Adresse (roh, minimal). | — |
| `location_context` | **Sammel-Bundle:** Standort + Adresse + 3 nächste Haltestellen + Wetter + POIs im 500-m-Umkreis. Ein Tool, ein Aufruf. | — |
| `location_nearby` | POIs in der Nähe, gefiltert nach Kategorie. | `radius_m=500`, `limit=20`, `categories=None` |
| `location_departures` | Live-Abfahrten (Echtzeit). **AVV-HAFAS und DB-HAFAS parallel** — bei `station=None` über Geo-Nähe, bei explizitem `station=`-String über parallele Text-Suche mit Name-Match. Siehe Detail unten. | `limit=10`, `station=None` |
| `location_trip_plan` | Nächste Verbindungen vom aktuellen Standort zum Ziel. Ziel als Stationsname **oder** Adresse. Aachen-/Eifel-Routen via AVV, Fernverkehr via DB, Mixed-Region DB-first mit AVV-Fallback. | `results=3`, `when=None` (= jetzt) |
| `location_weather` | Aktuelles Wetter + Tagesvorhersage. | — |
| `location_history` | Standort-Verlauf (älter zuerst kürzbar). | `limit=50`, `since=None` |
| `location_health` | Backend-Status (DB-HAFAS + AVV-HAFAS) mit Latenz pro Quelle und `summary: "ok" / "all_down"`. Nutzen, wenn ein Verkehrs-Tool unerwartet leer liefert oder einen Upstream-Fehler meldet — zeigt sofort, ob die ÖPNV-Quellen erreichbar sind. | — |

### `location_nearby` — gültige `categories`

`food`, `transport`, `health`, `shopping`, `services`, `leisure`, `tourism`, `education`. Mehrere zugleich als Liste, z.B. `["food", "shopping"]`. Kein Filter = alles.

### `location_trip_plan` — `when`-Parameter

ISO-8601 mit Zeitzone, z.B. `"2026-04-30T07:30:00+02:00"` für Verbindungen ab Mittwoch 7:30. Ohne `when`: ab jetzt.

### `location_trip_plan` — Regions-Routing

Seit 2026-05-19 nutzt der Service AVV-HAFAS auch für Trip-Planning (vorher nur DB). Die Heuristik:

| From-Region | To-Region | Reihenfolge |
|---|---|---|
| AVV (Aachen-Stadt/StädteRegion/Eifel) | AVV (z.B. Monschau, Stolberg, Eschweiler) | AVV-first |
| DB | DB (Fernverkehr) | DB-first |
| Mixed (z.B. AVV → DB-Fernverkehr) | — | DB-first mit AVV-Fallback |

**Konsequenz:** Routen wie `to="Monschau"` von Aachen aus liefern jetzt **direkte Bus-SB66-Verbindungen** statt eines 502, auch wenn DB-HAFAS gerade ausgefallen ist. Antwort enthält `data_source: "avv-hafas"` oder `"db-hafas"`, plus `tried: [...]` mit den probierten Backends.

### `location_departures` — drei Pfade, keine Lücke mehr

Seit 2026-05-19 ist der explizite-Station-Pfad nicht mehr DB-only.

| Eingabe | Wie wird aufgelöst |
|---------|--------------------|
| `station=None` (Auto-Modus) | Geo-Nähe-Lookup parallel über DB- und AVV-HAFAS, dann **Merge mit Dedup** im 2-Min-Fenster. Beste Coverage für Live-Position. |
| `station="<Name>"` (Text) | **Parallele Text-Suche** in DB+AVV. Name-Substring-Match priorisiert das passende Backend — "Scheibenstraße" landet auf AVV, "Berlin Hbf" auf DB. Danach `departures()` über den richtigen Client. |
| `station="<Stop-ID>"` (numerisch) | Wird als DB-Stop-ID behandelt (Konvention). |

**Konsequenz:** Lokale ASEAG-Linien (SB66 Brand↔Monschau, 22, 25, 47 …) erscheinen jetzt auch bei expliziter Text-Eingabe in der Antwort, weil AVV-HAFAS automatisch mit angefragt wird. Die alte Lücke (DB-Stationsname schluckt ASEAG-Linien) existiert nicht mehr für Text-Inputs — nur noch wenn der Bot explizit eine **numerische DB-IBNR** übergibt.

**Faustregel:** `station=None` bleibt erste Wahl wenn Oliver an der gemeinten Haltestelle steht. Bei Stationsnamen darf der Bot jetzt entspannt Text übergeben (`"Scheibenstraße"`, `"Bushof Aachen"`, `"Monschau Altstadt"`) — die Heuristik routet richtig. Für überregionale Bahnhöfe Text-Name oder DB-IBNR (z.B. `8000001` Aachen Hbf) beide OK.

## Typische Anfragen → Tool-Mapping

| Anfrage | Tool | Hinweis |
|---------|------|---------|
| "Wo bin ich gerade?" | `location_current` | Wenn nur die Adresse gefragt ist |
| "Was ist los um mich herum?" | `location_context` | Bundle, ein Aufruf statt vier |
| "Wann fährt mein Bus?" | `location_departures` | Default = nächste Haltestelle |
| "Wann fährt der Bus an Haltestelle X?" | `location_departures` mit `station="X"` | Text-Eingabe geht parallel durch DB+AVV mit Name-Match — ASEAG-Linien sind dabei. Wenn Oliver direkt an X steht, ist `station=None` trotzdem die einfachste Wahl (Geo-Merge). |
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
| 502 mit strukturiertem Body | Beide Backends down oder Schema-Mismatch | Body enthält `{backend, endpoint, error_class, suggested_action}`. Bei `error_class:"timeout"` ein zweiter Versuch nach ~30 s; bei `4xx` (`suggested_action:"user_input_needed"`) Oliver bitten zu präzisieren. |
| Antwort kommt nur aus einer Quelle (`data_source:"db-hafas"` oder `"avv-hafas"`) statt Merge | Das andere Backend war stumm oder hatte keinen Treffer | Normal. Kein Fehler. |

**Diagnose vor der Antwort:** Bei wiederholtem leerem Ergebnis oder bevor der Bot sich auf eine Verspätung festlegt, einen Blick auf `location_health` werfen — das Tool sagt direkt, ob DB-HAFAS oder AVV-HAFAS gerade hängt. Spart Rätselraten und macht die Bot-Antwort an Oliver ehrlich (»AVV ist gerade offline, deshalb fehlen die Stadtbus-Daten«).

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
