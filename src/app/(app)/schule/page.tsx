import { getCurrentPerson } from "@/lib/auth";
import {
  listKinder,
  listFaecher,
  listNoten,
  kontostand,
  listTaschengeld,
  getSparziel,
  listSchulEintraege,
  listFerienFuerKind,
} from "./actions";
import SchuleClient from "./SchuleClient";

export default async function SchulePage() {
  const person = await getCurrentPerson();
  const istEltern = person?.rolle === "ELTERN";
  const kinder = istEltern ? await listKinder() : [person!];

  const kinderDaten = await Promise.all(
    kinder.map(async (k) => {
      const [faecher, noten, stand, taschengeld, sparziel, ferien] = await Promise.all([
        listFaecher(k.id),
        listNoten(k.id),
        kontostand(k.id),
        listTaschengeld(k.id),
        getSparziel(k.id),
        listFerienFuerKind(k.id),
      ]);
      return {
        id: k.id,
        name: k.name,
        farbe: k.farbe,
        bundesland: k.bundesland,
        klassenstufe: k.klassenstufe,
        klasse: k.klasse,
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
        ferien,
      };
    })
  );

  const schulEintraege = await listSchulEintraege();

  return (
    <SchuleClient
      istEltern={!!istEltern}
      eigeneId={person!.id}
      kinder={kinderDaten}
      schulEintraege={schulEintraege.map((s) => ({
        id: s.id,
        titel: s.titel,
        fachName: s.fach?.name ?? s.fachName,
        art: s.art,
        datum: s.datum.toISOString(),
        personId: s.personId,
        personName: s.person.name,
        personFarbe: s.person.farbe,
      }))}
    />
  );
}
