import { describe, expect, it } from "vitest";
import { saloneDemo } from "../src/config/salone-demo.js";
import {
  calendario,
  congedo,
  proponiOrari,
  saluto,
  verificaOrario,
} from "../src/dominio/calendario.js";
import { descriviSettimana } from "../src/motore/frasi.js";
import { LUNEDI_SERA } from "./aiuti.js";

describe("calendario", () => {
  it("parte da oggi e segna i giorni di chiusura", () => {
    const cal = calendario(saloneDemo, LUNEDI_SERA);
    expect(cal[0]).toMatchObject({ data: "2026-10-05", etichetta: "lunedì 5 ottobre", oggi: true });
    expect(cal.find((g) => g.data === "2026-10-11")).toMatchObject({ etichetta: "domenica 11 ottobre", aperto: false });
    expect(cal).toHaveLength(15);
  });

  it("tiene conto delle chiusure straordinarie", () => {
    const cal = calendario({ ...saloneDemo, chiusure: ["2026-10-06"] }, LUNEDI_SERA);
    expect(cal.find((g) => g.data === "2026-10-06")?.aperto).toBe(false);
  });

  it("accetta solo orari dentro le fasce, con mezz'ora di margine prima della chiusura", () => {
    const v = (data: string, ora: string) => verificaOrario(saloneDemo, data, ora, LUNEDI_SERA);
    expect(v("2026-10-06", "18:00")).toEqual({ valido: true });
    expect(v("2026-10-06", "18:30")).toEqual({ valido: true });
    expect(v("2026-10-06", "18:45")).toEqual({ valido: false, motivo: "fuori_orario" });
    expect(v("2026-10-06", "13:30")).toEqual({ valido: false, motivo: "fuori_orario" });
    expect(v("2026-10-10", "15:00")).toEqual({ valido: false, motivo: "fuori_orario" });
    expect(v("2026-10-11", "10:00")).toEqual({ valido: false, motivo: "giorno_chiuso" });
    expect(v("2026-11-30", "10:00")).toEqual({ valido: false, motivo: "fuori_calendario" });
  });

  it("per oggi chiede almeno un'ora di preavviso", () => {
    const mattina = LUNEDI_SERA.set({ hour: 10, minute: 0 });
    expect(verificaOrario(saloneDemo, "2026-10-05", "10:30", mattina)).toEqual({ valido: false, motivo: "troppo_presto" });
    expect(verificaOrario(saloneDemo, "2026-10-05", "11:00", mattina)).toEqual({ valido: true });
  });

  it("propone due orari con margine quando il cliente dice da che ora è libero", () => {
    expect(proponiOrari(saloneDemo, "2026-10-06", "17:00", LUNEDI_SERA)).toEqual(["17:45", "18:00"]);
    expect(proponiOrari(saloneDemo, "2026-10-06", "12:00", LUNEDI_SERA)).toEqual(["15:00", "15:15"]);
    expect(proponiOrari(saloneDemo, "2026-10-06", "18:30", LUNEDI_SERA)).toEqual([]);
  });

  it("saluta e si congeda in base all'ora", () => {
    expect(saluto(saloneDemo, LUNEDI_SERA)).toBe("Buonasera");
    expect(congedo(saloneDemo, LUNEDI_SERA.set({ hour: 10 }))).toBe("Buona giornata");
  });

  it("descrive gli orari della settimana come una persona", () => {
    expect(descriviSettimana(saloneDemo)).toBe(
      "dal lunedì al venerdì dalle 9:00 alle 12:30 e dalle 15:00 alle 19:00, il sabato dalle 9:00 alle 12:30",
    );
  });
});
