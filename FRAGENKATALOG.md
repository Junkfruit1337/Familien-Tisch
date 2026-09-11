# Familientisch — Fragenkatalog vor dem technischen Grundgerüst

Stand: 27.08.2026 — Runde 1 (Fragen A–G) von Florian beantwortet am 27.08.2026, Umsetzung (Batch 11) am 27.08.2026

Dieses Dokument ergänzt die „Familientisch - Fahrplan.md" (dort steht der Gesamtüberblick, hier stehen die konkreten offenen Fragen strukturiert nach Bereich). Ziel: Florian geht die Fragen in Ruhe durch — direkt hier im Dokument antworten (z. B. unter jeder Frage eine Zeile „Antwort: …" ergänzen) oder im Chat mit Claude besprechen. Claude arbeitet die Antworten danach in den Prototyp und in den Fahrplan ein.

**Umsetzungsstand:** Nahezu alle Antworten aus Runde 1 (Fragen 1–34, Bereiche A–G) sind mit Batch 11 im Prototyp umgesetzt — Details siehe „Familientisch - Fahrplan.md", Abschnitt 3 („Stand des Prototyps") und der Log-Eintrag vom 27.08.2026 „Batch 11". Bewusst zurückgestellt, da echte Sprach-/Bild-KI im Hintergrund nötig wäre: Frage 5 (Spracheingabe für ganze Termine) und Frage 22 (Rezepte per Foto). Bereich H (Grundsatzfragen) wurde am 27.08.2026 beantwortet (siehe unten) — Phase 4 (technisches Grundgerüst) kann damit geplant werden. Frage 35 (Priorisierung) ist weiterhin offen.

Die Fragen sind in zwei Gruppen sortiert: **Jetzt sinnvoll zu klären** (betrifft den Prototyp direkt) und **Später** (betrifft erst das technische Grundgerüst / die Grundsatzfragen, die Florian bewusst erst nach dem fertigen Prototyp besprechen möchte — hier nur der Vollständigkeit halber dokumentiert).

---

## A. Kalender

1. **Erinnerungen:** Sollen Termine Erinnerungen/Push-Benachrichtigungen auslösen (z. B. „30 Min vorher")? Das geht technisch erst mit einer echten App (Phase 5), aber gut zu wissen, damit wir es im Datenmodell mitdenken.
   **Antwort:** Vorerst nein — es gibt ja noch keine echte App dafür. Als mögliche Verbesserung für später vormerken, evtl. irgendwann umsetzen.
2. **Terminserien:** Bei wiederkehrenden Terminen (täglich/wöchentlich/…) — reicht es, die ganze Serie zu löschen/ändern, oder soll man auch einzelne Termine aus einer Serie herausnehmen können (z. B. „diesen Mittwoch fällt Reiten aus")?
   **Antwort:** Ja, auch einzelne Termine. Wie in Outlook: beim Bearbeiten/Löschen eines Serientermins nachfragen, ob nur dieser eine Termin oder die ganze Serie betroffen ist.
3. **Termin-Typ (Termin/Hobby/Ausflug):** Du fandest die Unterscheidung fraglich, weil „eigentlich alles Termine sind". Sollen wir die drei Typen behalten (wird für Farben/Filter gebraucht), umbenennen, oder auf einen einzigen Typ reduzieren und Farbe stattdessen an der Person festmachen?
   **Antwort:** Automatische Unterscheidung zwischen Todo/Aufgabe, Termin und Schultermin (Klassenarbeit, Hü) — nicht manuell auswählen, die App soll das selbst erkennen/zuordnen.
4. **Vergangene Termine:** Sollen sie einfach in der Liste/Historie bleiben, oder nach einer Weile automatisch ausgeblendet/gelöscht werden?
   **Antwort:** Nur ausblenden (nicht löschen). In der Listenansicht standardmäßig nur bevorstehende Termine zeigen; per Button/Filter soll man vergangene Termine bei Bedarf wieder einblenden können.
5. **Spracheingabe für ganze Termine:** Aktuell füllt das Mikrofon nur das Titelfeld. Automatische Erkennung von Datum/Uhrzeit/Person aus freier Sprache (mit Bestätigungsdialog) braucht Sprach-KI im Hintergrund — für dich ein „Muss" für den Prototyp, oder eher „nice to have" für später?
   **Antwort:** Eigentlich ein Muss für den ganzen Termin — z. B. sagen können „Lege einen wöchentlich wiederkehrenden Termin namens Testtermin an, immer donnerstags um 15 Uhr", und das Formular wird automatisch vorausgefüllt; danach noch ändern/bestätigen können. *(Technischer Hinweis von Claude: braucht Sprach-KI im Hintergrund, die im aktuellen Artifact-Prototyp technisch nicht umsetzbar ist — realistisch erst mit echtem Hosting/Backend in Phase 5, siehe Fahrplan Abschnitt 4. Als „Muss" für die spätere App vorgemerkt.)*

## B. Einkaufsliste

6. **Mengen zusammenführen:** Wenn zweimal „Milch" auf der Liste landet (z. B. 1 l + 1 l), sollen die Mengen automatisch zusammengefasst werden?
   **Antwort:** Ja, automatisch zusammenführen. Beim Anklicken eines einzelnen Artikels soll er sich aber wieder aufsplitten lassen (z. B. „3× für Essensplan, 2× für Vorrat"), damit man sieht, wofür die Menge gebraucht wird.
7. **Kategorie-Reihenfolge:** Du wolltest die Reihenfolge später an den tatsächlichen Lidl-Marktaufbau anpassen. Sollen wir dafür eine einfache Möglichkeit bauen, die Reihenfolge selbst per Drag&Drop in der App festzulegen, oder schickst du uns einmalig die gewünschte Reihenfolge und wir tragen sie fest ein?
   **Antwort:** Reihenfolge soll direkt in der App änderbar sein. Außerdem sollen Kategorien selbst hinzugefügt werden können. Beides auf Eltern beschränkt (braucht das Rollen-/Login-System).
8. **Mehrere Geschäfte:** Reicht eine feste Kategorie-Reihenfolge (für Lidl), oder soll es mehrere „Profile" geben (z. B. Lidl, Rewe, Drogerie), zwischen denen man wählen kann?
   **Antwort:** Eine Reihenfolge reicht.
9. **Erledigte Artikel:** Nur manuell per Knopf löschen (wie jetzt), oder zusätzlich automatisch nach ein paar Tagen aufräumen?
   **Antwort:** Erledigte Artikel verschwinden aus der aktiven Liste und rutschen in einen Bereich darunter, z. B. „Bereits eingekauft". Bei Verklicken soll man einen Artikel von dort per Antippen wieder zurück in die Einkaufsliste holen können.

## C. Dienstplan

10. **Bad-Reihenfolge abends:** Ist die Annahme richtig, dass die Abend-Reihenfolge genau umgekehrt zur Morgen-Reihenfolge ist? Falls nicht: wie ist sie stattdessen?
    **Antwort:** Ja, bestätigt.
11. **Tägliches Abhaken:** Du warst unsicher, ob es sinnvoll ist, einzelne Dienst-Aufgaben täglich abzuhaken (weil sie z. B. beim Küchendienst mehrfach am Tag anfallen). Sollen die Aufgaben rein als Nachschlage-Liste bleiben (wie jetzt), oder soll es doch eine Art „heute erledigt"-Haken geben?
    **Antwort:** Ja, bleibt rein als Nachschlageliste.
12. **Ausnahmen/Tausch:** Was passiert bei Krankheit, Urlaub oder wenn zwei Kinder tauschen wollen — soll es eine Möglichkeit geben, die Schicht-Zuordnung für eine einzelne Woche manuell zu überschreiben?
    **Antwort:** Ja, einzelne Dienste sollen getauscht/geswitcht werden können — aber immer nur für eine einzelne Woche (keine dauerhafte Änderung der Rotation).
13. **Wochenwechsel:** Reicht der automatische wöchentliche Wechsel jeden Montag, oder gibt es Sonderfälle (Ferien, Feiertage), die berücksichtigt werden müssen?
    **Antwort:** Reicht so.

## D. Aufgaben

14. **„Wer schaut gerade?"-Umschalter:** Passt die aktuelle Lösung (Kind wählt sich selbst aus, sieht dann nur eigene + familienweite Aufgaben und Termine; Eltern sehen weiter alles und können filtern)? Wichtig: Das ist aktuell nur eine Komfort-Umschaltung ohne echten Zugriffsschutz — jede*r kann zurückwechseln. Reicht das für den Prototyp, oder ist dir eine echte Absicherung schon jetzt wichtig (bräuchte dann vorgezogenes Login)?
    **Antwort:** Für den Prototyp ausreichend. Für die spätere echte App wird ein verpflichtender Zugriffsschutz (echtes Login) benötigt.
15. **Wiederkehrende Aufgaben:** Sollen Aufgaben sich wiederholen können (z. B. „jeden Sonntag Zimmer aufräumen"), ähnlich wie Termine?
    **Antwort:** Ja.
16. **Erledigte Aufgaben:** Automatisch archivieren/ausblenden, oder wie jetzt einfach als „erledigt" markiert stehen lassen?
    **Antwort:** Wie bei der Einkaufsliste — erledigte Aufgaben rutschen in eine separate „Erledigt"-Liste, die man bei Bedarf auch wieder rückgängig machen (zurückholen) kann.

## E. Schule

17. **Verknüpfung mit Noten:** Soll ein angekündigter Termin („Klassenarbeit Mathe am 15.9.") automatisch mit der späteren Noteneingabe zu genau dieser Arbeit verknüpft werden, oder bleiben Schul-Termine und Noten wie jetzt zwei getrennte Bereiche?
    **Antwort:** Zwei getrennte Bereiche.
18. **Lernregel-Tracking:** Ihr habt eine Lernregel definiert (mind. 30 Min täglich, mehr vor Arbeiten). Soll die App das aktiv verfolgen/erinnern, oder bleibt das reine Referenz-Information wie jetzt?
    **Antwort:** Auf der Seite „Schule" sollen sowohl die Kinder selbst als auch die Eltern (mit Kinderfilter) sehen können, welche Arbeiten als Nächstes anstehen und dass/was dafür gelernt werden soll — also Tipps/Hinweise, dass gelernt werden muss. **Neue Idee:** Bei einer 1 oder 2 soll digitales Konfetti in der App fliegen (kleine Animation, die die Kinder erfreut).

## F. Noten & Taschengeld

19. **Beträge Note 3–6:** Aktuell als 0 € angenommen — soll es dabei bleiben, oder gibt es doch Beträge (auch negativ, als „Abzug"?) für schlechtere Noten?
    **Antwort:** Nein, bleibt bei 0 €.
20. **Schuljahresbeginn:** Passt die Annahme 1. August, oder ein anderes Datum?
    **Antwort:** Ja, 1. August passt (auch wenn da meist noch Ferien sind). Zur Einordnung: Emil ist in der 5. Klasse, Emma und Lina sind beide in der 6. Klasse; Ayla ist 3 Jahre alt und kommt erst im August 2029 in die 1. Klasse.
21. **Gewichtung:** Du hattest gesagt, das besprechen wir später — soll ich das Datenmodell trotzdem jetzt schon so anlegen, dass eine spätere Gewichtung (z. B. Klassenarbeit zählt doppelt) nachträglich einfach ergänzt werden kann, oder ist das nicht eilig?
    **Antwort:** Ja, gerne direkt mit einbauen — muss im Elternbereich einstellbar sein.
22. **Abgelehnte Noten:** Wenn ihr eine Note ablehnt (z. B. weil ein Fehler drin ist) — kann das Kind sie korrigiert neu einreichen, oder ist der Eintrag dann einfach „erledigt/abgelehnt" und fertig?
    **Antwort:** Beides: Das Kind kann die Note neu einreichen, und die Eltern sollen bei der Genehmigung selbst auch Werte korrigieren können, bevor sie genehmigt wird.
23. **Kontostand:** Kann der Kontostand ins Minus gehen (z. B. wenn ihr mal einen Vorschuss auszahlt), oder muss er immer bei 0 oder darüber bleiben?
    **Antwort:** Nein, geht nicht ins Minus — immer mindestens 0.
24. **Sparziel:** Soll es die Möglichkeit geben, ein Sparziel festzulegen (z. B. „Lina spart auf ein Fahrrad für 150 €") mit Fortschrittsanzeige?
    **Antwort:** Ja — Kinder sollen ein Sparziel mit Betrag usw. festlegen können, das sie sich mit Fortschrittsanzeige anschauen können.

## G. Rezepte & Essensplan

25. **Rezept-Erfassung per Foto:** Für dich wichtig genug, um früh Priorität zu bekommen (braucht Bilderkennung/KI im Hintergrund und ist im jetzigen Artifact technisch nicht machbar), oder kann das auf später warten?
    **Antwort:** Ja, ist verpflichtend (soll auf jeden Fall kommen), reicht aber, wenn wir das später umsetzen.
26. **Portionsgröße:** Aktuell fix „für 6" — soll die Portionszahl pro Rezept einstellbar sein, mit automatischer Mengenumrechnung?
    **Antwort:** Ja, einstellbar — manchmal sind nicht alle da oder essen nicht mit. Gerechnet wird mit Personen-Gewichten: Emma 1, Lina 1, Emil 1, Tugce 1, Ayla 0,5, Flo 1,5 → Standard-Summe 6.
27. **Lidl-Kategorie-Reihenfolge:** Siehe Frage 7 — hängt hier mit dran, weil die Zutaten aus dem Essensplan in dieselbe Einkaufsliste wandern.
    **Antwort:** Siehe Antwort zu Frage 7.

---

## H. Übergreifend — beantwortet am 27.08.2026 (Runde 4)

28. **Login/Zugriff:** Login pro Person oder gemeinsamer Familien-Zugang? Rechte-Modell (z. B. nur Eltern legen Schul-Einträge an, Kinder sehen wirklich nur ihre eigenen Sachen) hängt direkt daran.
    **Antwort:** Eigenes Login pro Person — echte, technisch erzwungene Zugriffsrechte (nicht mehr nur die „Wer schaut gerade?"-Komfortumschaltung).
29. **Hosting:** Eigener Server/Cloud-Anbieter oder vorerst weiter über Claude?
    **Antwort:** Eigenes Hosting aufbauen (nicht mehr nur der Claude-Artifact-Prototyp).
30. **Datenbank:** Welche Daten müssen dauerhaft & zuverlässig gespeichert werden (z. B. Noten-Historie)?
    **Antwort:** Änderungshistorie ist wichtig — nachvollziehbar, wer/wann was geändert hat (z. B. bei Noten oder Auszahlungen), nicht nur der aktuelle Stand.
31. **Kosten:** Laufender Kostenrahmen fürs Hosting, wer trägt sie?
    **Antwort:** Bis ca. 10–20 €/Monat.
32. **Domain:** Eigene Adresse (z. B. familientisch.app) gewünscht?
    **Antwort:** Vorerst reicht eine Unteradresse des Hosting-Anbieters, keine eigene Domain nötig. Kann später jederzeit auf eine eigene Domain umgezogen werden. *(Korrigiert durch Frage 41/Runde 5, 03.09.2026: Für ein vertrauenswürdiges HTTPS-Zertifikat braucht man technisch praktisch immer eine echte Domain — eine Unteradresse des Hosters reicht dafür meist nicht. Florian hat daraufhin bestätigt: eine eigene Domain wird gekauft, siehe Frage 41.)*
33. **Benachrichtigungen:** Push-Benachrichtigungen generell gewünscht (z. B. „neue Note wartet auf Freigabe", Termin-Erinnerung)?
    **Antwort:** Ja, gewünscht.
34. **Design:** Gibt es Wünsche für Farben/Look der echten App, oder passt der aktuelle Stil (grün/Serif-Schrift) als Basis?
    **Antwort:** Nein, eher Richtung Beige-Töne/skandinavisch (Wunsch von Tugce) statt des aktuellen Grün/Serif-Stils — Redesign für die echte App vorgesehen.

**Frage 35 (Priorisierung)** ist weiterhin offen — noch nicht beantwortet.

---

## I. Priorisierung

35. Von allen offenen Punkten unter A–G: Was ist dir am wichtigsten, dass es als Nächstes angegangen wird? Was kann warten?
    **Antwort (03.09.2026, siehe auch Frage 50):** Florian möchte auf nichts von dem verzichten, was in den bisherigen Runden besprochen und beantwortet wurde — alles soll möglichst vollständig ins Grundgerüst einfließen, keine bewusste Streichung/Vertagung einzelner Punkte. Details siehe Frage 50.

---

## Runde 3 — Batch-13-Feedback (27.08.2026)

Kein neuer Fragenkatalog nötig — Florian gab stattdessen 8 konkrete, direkt umsetzbare Feedback-Punkte zu Batch 12 (Essensplan-Zugriff, Einkaufs-Wünsche der Kinder, Dienst-Selbstausschluss + tageweiser Tausch, Badreihenfolge-Tausch, Schule-Datumsanzeige, kindbezogene Noten, eigener Einstellungen-Tab, Auszahlungs-Vorschau). Details und Umsetzung siehe „Familientisch - Fahrplan.md", Log-Einträge vom 27.08.2026 „Batch-13-Feedback" und „Batch 13". Punkt 9 blieb im Chat unvollständig — bei Florian nachgefragt, noch offen.

---

## Runde 5 — vor dem Start des technischen Grundgerüsts (02.09.2026)

Florian bat um eine komplette Durchsicht von Fahrplan, Fragenkatalog und App-Quellcode auf offene Punkte, Unstimmigkeiten und unbestätigte Annahmen, bevor das Grundgerüst (Phase 4) gebaut wird. Ergebnis: Frage 35 (Priorisierung) ist weiterhin offen, dazu kommen 17 neue konkrete Fragen, die sich aus der Recherche ergeben haben (technische Lücken, noch nie gestellte praktische Fragen, unbestätigte Design-Entscheidungen aus früheren Batches).

**Stand 03.09.2026: Alle 17 Fragen (36–52) sowie die zuvor offene Frage 35 sind von Florian beantwortet** (siehe „Antwort:" jeweils unten sowie die korrigierte Antwort zu Frage 32). Einziger noch offener Praxis-Punkt: der konkrete Domainname/Registrar (Frage 41) — das entscheidet Florian selbst. Damit ist der Weg für den Start des technischen Grundgerüsts (Phase 4) frei.

### J. Login & Rollen

36. **Login-Verfahren:** Volles Passwort pro Person, oder eher ein einfacheres Profil-Auswahl-System (wie bei Netflix: Profil antippen + kurze PIN) — gerade für die jüngeren Kinder praktikabler und weniger nervig als ein richtiges Passwort?
    **Antwort:** Einfacher PIN (4 Stellen) pro Person reicht, wie beim Handy-Entsperren — kein volles Passwort nötig (aktuell erstmal nur zum Testen innerhalb der Familie gedacht).
37. **Rollen-Feinheit:** Reicht die Unterscheidung „Eltern" vs. „Kind", oder gibt es Fälle, in denen Flo und Tugce unterschiedliche Rechte brauchen sollen (z. B. nur einer verwaltet Server-Einstellungen/Kosten)?
    **Antwort:** Ja, die zwei Rollen Eltern/Kind reichen aus — Flo und Tugce brauchen keine unterschiedlichen Rechte.
38. **Ayla:** Braucht sie einen eigenen Zugang/Login (z. B. falls sie später mal ein Familien-Tablet nutzt), oder bleibt sie technisch rein eine „Person" im System ohne eigenen Account (wie aktuell im Prototyp)?
    **Antwort:** Kein eigener Zugang. Sie muss aber weiterhin als Person im System angelegt und von den Eltern verwaltet werden können — im Rollenmodell praktisch eine dritte Kategorie „Kind ohne eigenen Zugang" (Kleinkind), ohne eigenes Login/PIN.
39. **Passwort/PIN vergessen:** Reicht „Eltern setzen es im Adminbereich zurück", oder braucht es einen E-Mail-Reset-Mechanismus?
    **Antwort:** Ja, reicht — Eltern setzen den PIN im Adminbereich zurück. Kein E-Mail-Reset nötig.

### K. Erreichbarkeit, Domain, Geräte

40. **Erreichbarkeit von unterwegs:** Soll die App von überall aus dem Internet erreichbar sein (Schule, Arbeit, unterwegs), oder nur im Heim-WLAN? Das beeinflusst direkt, wie viel Aufwand in Absicherung (Firewall, Login-Sicherheit, HTTPS) nötig ist.
    **Antwort:** Ja, von überall erreichbar — wie eine normale Webseite mit Login. Zusätzlich soll man sich die App aufs Handy als Web-App installieren können („zum Startbildschirm hinzufügen"), damit sie sich wie eine echte App anfühlt.
41. **Domain — technische Klärung:** Für ein vertrauenswürdiges HTTPS-Zertifikat (damit Handy/Browser der Seite ohne Warnung vertrauen) braucht man technisch praktisch immer einen echten Domainnamen — eine reine IP-Adresse reicht dafür nicht gut aus. Die bisherige Antwort „Unteradresse reicht, keine eigene Domain nötig" (Frage 32) könnte technisch missverstanden worden sein: Passt eine sehr günstige eigene Domain (ca. 1–15 €/Jahr, z. B. eine .de-Adresse) locker ins Budget, oder soll ich gezielt nach einem Weg ganz ohne eigene Domain suchen (technisch etwas aufwändiger/unüblicher)?
    **Antwort:** Ja, eine eigene Domain wird gekauft/gemietet — passt locker ins Budget. Löst/ersetzt die frühere Antwort zu Frage 32. **Entschieden (09.09.2026):** familien-tisch.de, registriert bei Hetzner (konsoleH, ca. 4,90 €/Jahr). DNS-A-Eintrag ist auf die Server-IP 2.28.24.32 gesetzt (erledigt).
42. **Handys der Familie:** Nutzt ihr iPhones, Android oder gemischt? Push-Benachrichtigungen und „zum Startbildschirm hinzufügen" funktionieren auf iPhones erst seit iOS 16.4 und etwas eingeschränkter als auf Android — gut zu wissen, damit ich das realistisch einplane statt später eine böse Überraschung zu erleben.
    **Antwort:** Gemischt — nur Tugce hat ein iPhone (16 Pro/Max), alle anderen Android. Das iPhone 16 Pro/Max erfüllt die iOS-16.4-Mindestanforderung locker, Push/PWA sollten also bei ihr problemlos funktionieren. *(Ergänzung von Claude, 03.09.2026: Florian hat zusätzlich beobachtet, dass eine andere Familien-Webseite („Kita Plus Eltern") Push-Benachrichtigungen erst zuließ, nachdem seine Frau die Seite als Web-App installiert hatte — ein gutes Indiz dafür, dass genau dieser PWA-Weg [„zum Startbildschirm hinzufügen" statt echter App-Store-App] für Familientisch funktionieren sollte. Wird bei der technischen Umsetzung berücksichtigt.)*

### L. Daten, Historie, Umzug vom Prototyp

43. **Umfang der Änderungshistorie:** Soll sie für alle Bereiche gelten (auch Kalender, Einkaufsliste, Dienstplan), oder nur für die „heiklen" Bereiche Noten/Taschengeld, wie ursprünglich bei Frage 30 angesprochen?
    **Antwort:** Florian war unsicher und bat Claude um Denkanstöße. Claudes Einschätzung: Eine Historie lohnt sich dort, wo Geld/Bewertungen dranhängen (Noten, Taschengeld/Auszahlungen) und überall dort, wo mehrere Personen dieselben Daten ändern können und ein „wer hat das geändert" bei einem Fehler hilft (Termine, Aufgaben, Dienst-Tausch, Einkaufs-Wünsche) — nicht aber bei der laufenden Einkaufsliste selbst (Häkchen setzen/Artikel abhaken), wo eine Historie keinen erkennbaren Nutzen hätte. Entscheidung: Änderungshistorie für Noten, Taschengeld/Auszahlungen, Termine, Aufgaben, Dienst-Tausch und Einkaufs-Wünsche — nicht für die alltägliche Einkaufslisten-Pflege selbst. Bei Bedarf später erweiterbar.
44. **Sichtbarkeit der Historie:** Sollt ihr selbst in der App sehen können „wer hat was wann geändert", oder ist das eher eine technische Absicherung im Hintergrund, die nur bei Bedarf (z. B. bei Streit „wer hat das gelöscht") von den Eltern eingesehen wird?
    **Antwort:** Sichtbar für die Eltern direkt in der App — z. B. bei einem Termin durch Antippen ein aufklappbarer Bereich „Änderungshistorie" mit den einzelnen Änderungen (was, von wem, wann), die man einzeln anklicken kann. Hauptzweck: als Elternteil/Admin nachvollziehen können, ob jemand versehentlich etwas geändert hat, das später zu einem Fehler führt.
45. **Umzug der Testdaten:** Sollen die aktuell im Prototyp eingetragenen Test-Einträge (Noten, Aufgaben, Rezepte usw.) in die echte App übernommen werden, oder startet die echte App mit einem leeren, sauberen Datenbestand?
    **Antwort:** Nein — die echte App startet mit leerem Datenbestand. Die Prototyp-Einträge sind reine Testdaten.

### M. Noch unbestätigte Design-Entscheidungen aus dem Prototyp

Diese vier Punkte wurden beim Bauen bereits eigenständig entschieden (siehe Fahrplan-Log), aber nie ausdrücklich von Florian bestätigt — bevor sie fest ins Grundgerüst einfließen, hier die ausdrückliche Nachfrage:

46. **Dienst-Tage-Tausch/-Abgabe:** Zeigt bisher nur eine Info-Meldung an, ändert die zugrunde liegende Dienst-Zuordnung aber nicht wirklich. Soll das im Grundgerüst weiterhin so bleiben (einfacher), oder soll ein Tage-Tausch die Zuordnung tatsächlich technisch ändern (aufwändiger, aber „echter")?
    **Antwort:** Ja — im Grundgerüst soll der Tausch die Dienst-Zuordnung tatsächlich technisch ändern, nicht nur eine Info-Meldung anzeigen.
47. **Abgelehnter Einkaufs-Wunsch:** Verschwindet aktuell beim Ablehnen komplett, ohne dass das Kind eine Rückmeldung sieht. Passt das so, oder soll das Kind erfahren, dass/warum sein Wunsch abgelehnt wurde?
    **Antwort:** Nein — es soll eine Wunsch-Historie geben (Kinder sehen nur ihre eigenen, Eltern sehen alle), mit Status „angenommen"/„abgelehnt", wer den Wunsch eingereicht hat und wann.
48. **Mehrere gleichzeitige Dienst-Tausche in derselben Woche:** Lassen sich beim Aufheben aktuell nur alle zusammen zurücksetzen (nicht einzeln). Reicht das, oder soll das im Grundgerüst einzeln aufhebbar sein?
    **Antwort:** Florian hat das an Claudes Einschätzung delegiert („mach es clever, sinnvoll und logisch, ich verstehe die Frage nicht"). Entscheidung: Im Grundgerüst wird jeder Tausch einzeln aufhebbar (nicht mehr nur gemeinsam) — naheliegender, falls z. B. zwei unabhängige Tausche in derselben Woche laufen und nur einer rückgängig gemacht werden soll.
49. **Zwei unterschiedliche Wochen-Rhythmen:** Die Kalenderwoche startet Montag, die Essensplan-Woche startet Samstag (bewusst so gebaut, weil die Familienwoche „Samstag bis Freitag" läuft). Passt das so, oder soll das im Grundgerüst vereinheitlicht werden?
    **Antwort:** Bleibt so — bewusst zwei unterschiedliche Rhythmen, weil Florian samstags einkaufen geht und die Essenswoche von Samstag zu Samstag plant, während die Kalenderwoche normal montags beginnt.

### N. Offen aus früheren Runden + neue Rückmeldungen

50. **(= Frage 35) Priorisierung:** Von allem, was noch fehlt oder ansteht — was ist dir am wichtigsten für den ersten Wurf des Grundgerüsts? Was kann in einer späteren Ausbaustufe kommen?
    **Antwort:** Florian möchte auf nichts von dem verzichten, was in den Runden 1–5 besprochen und beantwortet wurde — alles soll möglichst vollständig in den ersten Wurf des Grundgerüsts einfließen, keine bewusste Streichung/Vertagung einzelner Punkte. In der Praxis werden sich nach dem Start zwar trotzdem noch Anpassungen ergeben, aber es soll nicht von vornherein etwas ausgeklammert werden.
51. **Tages-Dashboard-Idee:** Deine Idee einer eigenen Übersichtsseite (heutiges Essen + anstehende Klassenarbeiten/Kontrollen + Lerntipps an einem Ort) — soll das ins Grundgerüst mit rein, oder erstmal zurückgestellt werden?
    **Antwort:** Ja, rein ins Grundgerüst.
52. **Neue Optik (Beige/skandinavisch):** Hattet ihr (du/Tugce/Kinder) schon Gelegenheit, euch das neue Design anzuschauen? Passt es so, oder gibt es noch Anpassungswünsche, bevor wir es fest ins Grundgerüst übernehmen?
    **Antwort:** Passt so, keine Anpassungswünsche.

---

*Nach jeder beantworteten Runde aktualisiert Claude dieses Dokument (Antworten werden direkt bei der Frage ergänzt und offene Fragen als erledigt markiert) sowie die „Familientisch - Fahrplan.md".*
