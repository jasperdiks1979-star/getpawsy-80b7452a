# Bevindingen (read-only, geen wijzigingen)

## Vastgesteld
- De productiedatabase van GetPawsy draait op **Lovable Cloud** (door Lovable beheerd), niet in een extern account. Eén instantie bedient preview én getpawsy.pet.
- Daarom verschijnt hij niet in het eigen account (organisatie "Getp" zonder projecten), en vindt ChatGPT's OAuth terecht "No organizations found": de gebruiker is daar geen eigenaar/lid van.
- Directe dashboardtoegang, de service-role-sleutel en het databasewachtwoord zijn op Lovable Cloud **niet beschikbaar**. Het project kan niet worden overgezet naar een eigen account, en losmaken van Cloud is niet mogelijk.
- De backendfuncties (o.a. Pinterest- en `cj-*`-functies) staan in de projectcode en worden **automatisch gedeployed** wanneer code in Lovable verandert. Afzonderlijke deploys via een externe CLI/OAuth worden niet ondersteund.

## Toegang tot PRECIES deze database
- Via Lovable: knop "View Backend" (tabellen, logs, secrets, gebruikers) in dit project.
- Via deze chat: read-only queries en functielogs; schrijfacties alleen na expliciete goedkeuring.
- Geen route om ChatGPT/externe tools rechtstreeks aan deze database te koppelen zonder een nieuw project — dat valt buiten de opdracht.

## Veiligste ondersteunde route voor Pinterest-functie en CJ retry-worker
1. In een build-ronde in dit project de functiecode toevoegen/bijwerken; Lovable deployt alleen die gewijzigde functie(s).
2. Autorisatie: functie controleert admin-rol (`user_roles`) of een cron-secret; secrets alleen via Projectinstellingen → Secrets.
3. Verificatie: één gerichte testaanroep + logcontrole, geen echte publicatie (dry-run).
4. Rollback: vorige versie herstellen via Lovable History, of de functie verwijderen; data blijft ongemoeid.

## Kosten
- Dit onderzoek is uitgevoerd zonder deploys of schrijfacties. Een build-ronde voor stap 1–3 kost wel Lovable-credits; dat vraagt aparte goedkeuring.
