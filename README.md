# Trade-up-kalkylator

Räknar på CS2-trade-ups med priser från tradeit.gg. Sidan finns på
**https://rikky5000.github.io/tradeup/**.

- **Inputs:** välj 10 skins av samma rarity och ange float. Priset fylls i från tradeit, och du kan skriva ett eget.
- **Resultat:** varje möjligt outcome med chans, float, wear och tradeit-pris. Sidan visar också förväntat värde (EV), vinst eller förlust och chansen att gå med vinst.
- **Inbytesvärde:** listpris ÷ 1,15 som standard. Det går att ändra på sidan.
- **Spara eller dela:** uppställningen sparas i adressen, så det går att bokmärka den.

Priserna uppdateras var 6:e timme av GitHub Actions (`.github/workflows/deploy.yml`). Om du vill uppdatera direkt: gå till **Actions → Uppdatera priser och publicera → Run workflow**.

## Regler
Reglerna bygger på communityns mätningar efter CS2-uppdateringen 22 oktober 2025. Valve publicerar inte formlerna.

- 10 inputs med samma rarity. Alla måste vara StatTrak eller ingen.
- Chans per outcome = (inputs från collectionen ÷ 10) ÷ (antal skins i nästa rarity i den collectionen).
- Outputfloat = outcome-min + snitt av (inputfloat − min) ÷ (max − min) × (outcome-max − outcome-min).
- Kontraktet med 5 Covert för kniv eller handskar ingår inte.

## Begränsningar
- Priset är tradeits lägsta listpris för den wearen. Float inom en wear påverkar inte priset.
- Skins som tradeit inte har i lager saknar pris. Sidan varnar för det.

## Utveckling
```bash
node --test tests/*.test.mjs
python scripts/fetch_data.py --max-pages 3   # snabbtest av datahämtningen
```

Källor: skindata från [ByMykel/CSGO-API](https://github.com/ByMykel/CSGO-API), priser från tradeit.gg.
