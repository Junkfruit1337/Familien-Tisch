import { getCurrentPerson } from "@/lib/auth";
import {
  listKinder,
  listFaecher,
  listNoten,
  kontostand,
  listTaschengeld,
  getSparziel,
  listNotenGewichtung,
  listSchulEintraege,
  listFachNamenFuerKinder,
} from "./actions";
import SchuleClient from "./SchuleClient";

export default async function SchulePage() {
  const person = await getCurrentPerson();
  const istEltern = person?.rolle === "ELTERN";
  const kinder = istEltern ? await listKinder() : [person!];

  const kinderDaten = await Promise.all(
    kinder.map(async (k) => {
      const [faecher, noten, stand, taschengeld, sparziel, gewichtung] = await Promise.all([
        listFaecher(k.id),
        listNoten(k.id),
        kontostand(k.id),
        listTaschengeld(k.id),
        getSparziel(k.id),
        istEltern ? listNotenGewichtung(k.id) : Promise.resolve([]),
      ]);
      return {
        id: k.id,
        name: k.name,
        farbe: k.farbe,
        faecher: faecher.map((f) => ({ id: f.id, name: f.name })),
        noten: noten.map((n) => ({
          id: n.id,
          fachId: n.fachId,
          fachName: n.fach.name,
          art: n.art,
          note: n.note,
          datum: n.datum.toISOString(),
          status: n.status,
          notiz: n.notiz,
          gewichtung: n.gewichtung,
          fotoBase64: n.fotoBase64,
        })),
        kontostand: stand,
        taschengeld: taschengeld.map((t) => ({
          id: t.id,
          betrag: t.betrag,
          typ: t.typ,
          grund: t.grund,
          createdAt: t.createdAt.toISOString(),
        })),
        sparziel: sparziel ? { bezeichnung: sparziel.bezeichnung, zielbetrag: sparziel.zielbetrag } : null,
        gewichtung,
      };
    })
  );

  const schulEintraege = await listSchulEintraege();
  const fachNamen = await listFachNamenFuerKinder(kinder.map((k) => k.id));

  return (
    <SchuleClient
      istEltern={!!istEltern}
      eigeneId={person!.id}
      kinder={kinderDaten}
      schulEintraege={schulEintraege.map((s) => ({
        id: s.id,
        titel: s.titel,
        fachName: s.fachName,
        art: s.art,
        datum: s.datum.toISOString(),
        personId: s.personId,
        personName: s.person.name,
        personFarbe: s.person.farbe,
      }))}
      fachNamen={fachNamen}
    />
  );
}
