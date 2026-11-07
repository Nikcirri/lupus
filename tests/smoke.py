"""Prova completa dell'app nel browser (Chrome), come farebbe una persona.

Uso (dopo `npm run build`):  python3 tests/smoke.py
Serve Python con Playwright e Google Chrome installati. Non gira su GitHub Actions.
"""
import http.server
import json
import pathlib
import socketserver
import sys
import threading

from playwright.sync_api import sync_playwright

DIST = pathlib.Path(__file__).resolve().parent.parent / "dist"
errors = []


def serve():
    handler = lambda *a, **k: http.server.SimpleHTTPRequestHandler(*a, directory=str(DIST), **k)
    httpd = socketserver.TCPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print("  ok -", msg)


def hold(page, selector, overlay, during=None):
    """Tiene premuto il dito su un pulsante: restituisce (visibile mentre premuto, nascosto dopo)."""
    box = page.locator(selector).bounding_box()
    page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    page.mouse.down()
    shown = page.locator(overlay).is_visible()
    if during:
        during()
    page.mouse.up()
    return shown, page.locator(overlay).is_hidden()


def main():
    httpd = serve()
    url = f"http://127.0.0.1:{httpd.server_address[1]}/index.html"
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        context = browser.new_context(viewport={"width": 390, "height": 844})
        context.grant_permissions(["clipboard-read", "clipboard-write"])
        page = context.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.goto(url)
        page.wait_for_load_state("networkidle")

        print("Benvenuto")
        check(page.locator("#modalWelcome").is_visible() and "Benvenuto in Lupus" in page.locator("#modalWelcome").inner_text(), "al primo avvio compare il benvenuto")
        page.click("#btnWelcomeNext")
        page.click("#btnWelcomeNext")
        check("Iniziamo" in page.locator("#btnWelcomeNext").inner_text() and "Senza Narratore" in page.locator("#modalWelcome").inner_text(), "tre schermate di benvenuto")
        page.click("#btnWelcomeNext")
        check(page.locator("#modalWelcome").is_hidden(), "benvenuto chiuso")

        print("Setup in tre tappe")
        check(page.locator("#headerTitle").inner_text() == "Lupus", "titolo Lupus")
        check(page.locator("#setupPane1").is_visible() and page.locator("#setupPane2").is_hidden(), "si parte dalla tappa dei giocatori")
        check(page.locator("#btnSetupNext").is_disabled() and "almeno 5 giocatori" in page.locator("#stickyDeckProblem").inner_text(), "avanti spento senza giocatori, con il motivo")
        check(page.locator("#setupStepper .setup-step[data-step='2']").is_disabled(), "non si salta al mazzo senza giocatori")
        page.fill("#playerNameInput", "Anna, Bruno, Carla, Dario, Elena, Fabio")
        page.click("text=+ Aggiungi")
        check(page.locator(".player-chip").count() == 6, "6 giocatori aggiunti")
        check(page.locator("#btnFullscreen").count() == 0, "niente pulsante schermo intero")
        check(page.locator(".player-chip .avatar").count() == 6, "ogni giocatore ha il suo cerchietto con l'iniziale")
        colors = page.evaluate("[...document.querySelectorAll('.player-chip .avatar')].map(a => a.style.getPropertyValue('--av'))")
        check(len(set(colors)) == 6, "colori tutti diversi")
        page.locator(".player-chip").nth(1).locator(".player-chip-remove").click()
        check(page.locator(".player-chip").count() == 5 and page.locator("#undoToast").is_visible(), "giocatore tolto con avviso Annulla")
        page.click("#undoToast .undo-toast-btn")
        check(page.locator(".player-chip").count() == 6 and "Bruno" in page.locator("#playerChipsList").inner_text(), "Annulla: Bruno torna in lista")
        check(page.locator("#btnSetupNext").is_enabled() and "il mazzo" in page.locator("#btnSetupNext").inner_text(), "con 6 giocatori si va avanti al mazzo")
        page.click("#btnSetupNext")
        check(page.locator("#setupPane2").is_visible() and page.locator("#setupPane1").is_hidden(), "tappa 2: il mazzo")
        check(page.locator("#btnSetupNext").is_enabled(), "preset scelto in automatico: si può andare avanti")

        # Mazzo personalizzato senza lupi: deve spiegare il problema
        page.click("#tabBtnCustom")
        page.click("text=Azzera mazzo")
        check("Mancano 6 ruoli" in page.locator("#stickyDeckProblem").inner_text(), "spiega che mancano ruoli")
        page.evaluate("for (let i = 0; i < 6; i++) changeCustomRoleQty('contadino', 1)")
        check("almeno un Lupo" in page.locator("#stickyDeckProblem").inner_text(), "spiega che serve un lupo")
        page.click("#tabBtnPresets")
        page.locator(".preset-item").first.click()
        check(page.locator("#stickyDeckProblem").is_hidden(), "preset valido: nessun problema")

        # Tutti i preset da 5 a 15 devono essere distribuibili
        for n in range(5, 16):
            ok = page.evaluate(
                """n => (PRESETS_BY_COUNT[n] || []).every(p => getDeckProblems(p.roles, n, findRoleOrNull).length === 0)""",
                n,
            )
            check(ok, f"preset da {n} giocatori validi")

        page.click("#btnSetupNext")
        check(page.locator("#setupPane3").is_visible() and page.locator(".mode-choice.active").get_attribute("data-mode") == "narrator", "tappa 3: opzioni, con il Narratore di partenza")
        check("Distribuisci" in page.locator("#btnSetupNext").inner_text(), "ultimo pulsante: Distribuisci")
        check(page.evaluate("handleAndroidBack()") is True and page.locator("#setupPane2").is_visible(), "Indietro torna alla tappa prima")
        page.click("#setupStepper .setup-step[data-step='3']")

        print("Distribuzione")
        page.click("#btnSetupNext")
        for i in range(6):
            check(page.locator("#btnDistNext").is_disabled(), f"giocatore {i + 1}: 'Ho visto' spento prima di guardare")
            if i == 0:
                # Tasto Indietro mentre il ruolo è visibile: lo copre
                shown, hidden = hold(page, "#btnRevealRole", "#distStepReveal",
                                     lambda: check(page.evaluate("handleAndroidBack()") is True, "indietro gestito"))
            else:
                shown, hidden = hold(page, "#btnRevealRole", "#distStepReveal")
            check(shown and hidden, f"ruolo {i + 1} visibile solo col dito premuto")
            check(page.locator("#btnDistNext").is_enabled(), f"giocatore {i + 1}: 'Ho visto' acceso")
            page.click("#btnDistNext")
        page.click("text=Inizia la Partita")
        check(page.locator("#screenNarrator").is_visible(), "cruscotto del narratore")

        # Prepara una situazione nota: ruoli fissi
        page.evaluate(
            """() => {
              const roles = ['lupo', 'veggente', 'guardia', 'contadino', 'giullare', 'medium'];
              activeMatch.players.forEach((p, i) => { p.roleId = roles[i]; p.originalRoleId = roles[i]; });
              activeMatch.initialDeckMap = { lupo: 1, veggente: 1, guardia: 1, contadino: 1, giullare: 1, medium: 1 };
              saveMatchToStorage(); renderNarratorDashboard();
            }"""
        )
        guide = lambda: page.locator("#guideStep").inner_text()
        target = lambda name: page.locator(f"#guideStep .target-btn:has-text('{name}')")
        nxt = lambda: page.click("#guideBottomBar .guide-next")

        print("Notte 1 guidata")
        check("Cala la notte" in guide() and "Veggente" in guide(), "inizio della notte con i ruoli da chiamare")
        check(page.locator(".guide-chip").count() == 5, "passi: notte, veggente, guardia, lupi, alba")
        nxt()
        check("È: Bruno" in guide() and "Si sveglia il Veggente" in guide(), "passo del Veggente con la sua frase")
        check(target("Bruno").is_disabled(), "il Veggente non può sondare sé stesso")
        target("Anna").click()
        check("Fai SÌ" in guide(), "Veggente: Anna è un lupo -> SÌ")
        nxt()
        check(target("Carla").is_disabled(), "la Guardia non protegge sé stessa")
        target("Bruno").click()
        nxt()
        check(target("Anna").is_disabled() and "è un lupo" in target("Anna").inner_text(), "i lupi non scelgono un lupo")
        target("Dario").click()
        check("Vittima dei lupi: Dario" in guide(), "vittima scelta")
        nxt()
        check("Dario muore" in guide() and "sbranato" in guide(), "alba: Dario morirà")
        page.click("#guideBottomBar button:has-text('Fai sorgere il Giorno 1')")

        print("Giorno 1 guidato")
        check("Giorno 1" in page.locator("#narratorPhaseBadge").inner_text(), "è giorno")
        check("è morto Dario" in guide(), "annuncio del mattino automatico")
        check(page.evaluate("activeMatch.players[3].isDead && activeMatch.players[3].deathCause === 'notte'"), "Dario segnato morto da solo")
        check("Fantasma" in guide(), "Dario diventa il Fantasma")

        # Scheda Giocatori: correzioni (Giullare al rogo -> vince lui)
        page.click("#tabBtnPlayers")
        cards = page.locator(".narrator-player-card")
        check("Fantasma" in cards.nth(3).inner_text(), "nella scheda Giocatori Dario è il Fantasma")
        cards.nth(4).locator("button[title='Elimina / Uccidi giocatore']").click()
        check(page.locator("#modalDeathCause").is_visible(), "di giorno chiede come è morto")
        page.click("#modalDeathCause button:has-text('Bruciato al rogo')")
        check("GIULLARE" in page.locator("#victoryBannerText").inner_text(), "vittoria del Giullare al rogo")
        page.click("text=✖ Continua")
        cards.nth(4).locator("button[title='Elimina / Uccidi giocatore']").click()
        check("Vivo" in cards.nth(4).inner_text(), "Elena di nuovo viva")
        page.click("#tabBtnGuide")

        nxt()
        check(page.locator("#dayTimerDisplay").is_visible(), "dibattito con il timer")
        page.click("text=+30s")
        check(page.locator("#dayTimerDisplay").inner_text() == "03:30", "timer +30s")
        page.click("text=−30s")
        nxt()

        print("Votazione")
        page.click("#guideStep button:has-text('Apri la votazione')")
        check(page.locator("#modalVote").is_visible(), "finestra votazione")
        check(page.locator("#voteVotersList .vote-voter-chip").count() == 6, "votano 5 vivi + il Fantasma")
        vote = lambda name: page.locator(f"#votePicker .target-btn:has-text('{name}')").click()
        check("Vota Anna" in page.locator("#votePicker").inner_text(), "si parte dal primo che deve votare")
        # Pareggio: Anna 2 (Bruno, Carla) - Fabio 2 (Anna, Dario fantasma)
        for name in ("Fabio", "Anna", "Anna", "Fabio"):
            vote(name)
        check("Hanno votato 4 su 6" in page.locator("#voteProgress").inner_text(), "un tocco per voto, si passa da soli al votante dopo")
        check("Pareggio" in page.locator("#voteActions").inner_text(), "pareggio riconosciuto")
        page.click("#voteActions button:has-text('Ballottaggio')")
        check(page.locator("#votePicker .target-btn").count() == 2, "al ballottaggio si vota solo tra i due")
        page.click("#votePicker button:has-text('Si astiene')")
        for _ in range(3):
            vote("Fabio")
        check("si astiene" in page.locator("#voteVotersList").inner_text(), "chi si astiene è segnato")
        check("Brucia Fabio (3 voti)" in page.locator("#voteActions").inner_text(), "Fabio in testa con 3 voti")
        page.click("#voteActions button:has-text('Brucia Fabio')")
        check(page.locator("#modalVote").is_hidden(), "votazione chiusa senza conferma")
        check(page.locator("#undoToast").is_visible() and "Fabio" in page.locator("#undoToastText").inner_text(), "avviso con Annulla dopo il rogo")
        page.click("#undoToast .undo-toast-btn")
        check(page.evaluate("activeMatch.players[5].isDead") is False, "Annulla: Fabio di nuovo vivo")
        page.click("#guideStep button:has-text('Apri la votazione')")
        check("Brucia Fabio (3 voti)" in page.locator("#voteActions").inner_text(), "i voti erano rimasti salvati")
        page.click("#voteActions button:has-text('Brucia Fabio')")
        page.wait_for_timeout(2300)
        check(page.locator("#undoToast").is_hidden(), "l'avviso sparisce dopo 2 secondi")
        check("bruciato Fabio" in guide(), "il passo del voto mostra il condannato")
        nxt()
        page.click("#guideBottomBar button:has-text('Inizia la Notte 2')")

        print("Notte 2 guidata")
        check(page.locator(".guide-chip").count() == 6, "dalla seconda notte c'è anche il Medium")
        page.click(".guide-chip:has-text('Medium')")
        check(page.locator("#emptyCallCountdown").is_visible() and "Aspetta" in page.locator("#emptyCallCountdown").inner_text(), "Medium morto: chiamata a vuoto con attesa")
        page.evaluate("emptyCallTimer.endsAt = Date.now()")
        page.wait_for_timeout(400)
        check("Ora chiudi" in page.locator("#emptyCallCountdown").inner_text(), "fine dell'attesa")
        nxt()
        check(target("Bruno").is_disabled() and "ieri" in target("Bruno").inner_text(), "la Guardia non protegge due notti di fila la stessa persona")
        target("Elena").click()
        nxt()
        target("Elena").click()
        check("si salverà" in guide(), "i lupi scelgono chi è protetto: si salva")
        nxt()
        check("protetto" in guide() and "Manca la scelta" in guide(), "alba: salvataggio e scelta mancante del Veggente")
        page.click("#guideBottomBar button:has-text('Fai sorgere il Giorno 2')")
        check("non è morto nessuno" in guide(), "annuncio: nessun morto")

        # ↩️ Fase: si torna indietro di più fasi
        for expected in ("Notte 2", "Giorno 1", "Notte 1"):
            page.click("#btnUndoTop")
            check(expected in page.locator("#narratorPhaseBadge").inner_text(), f"↩️ tornato a {expected} senza conferma")
        check(page.locator("#btnUndoTop").is_disabled(), "↩️ spento alla prima fase")
        check("Fine della notte" in guide(), "si riprende dall'alba della notte 1 con le scelte fatte")
        page.click("#guideBottomBar button:has-text('Fai sorgere il Giorno 1')")

        # Anna (lupo) al rogo dalla scheda Giocatori: vince il villaggio
        page.click("#tabBtnPlayers")
        cards = page.locator(".narrator-player-card")
        cards.nth(0).locator("button[title='Elimina / Uccidi giocatore']").click()
        page.click("#modalDeathCause button:has-text('Bruciato al rogo')")
        check("VILLAGGIO" in page.locator("#victoryBannerText").inner_text(), "lupo bruciato: vince il villaggio")

        # Interruttore "Morti e vittorie automatiche"
        page.click("#btnSettingsTop")
        page.click("#modalGameMenu label:has(#toggleAutoResolveInGame)")
        check(page.locator("#victoryBanner").is_hidden(), "automatismi spenti: niente vittoria automatica")
        page.click("#modalGameMenu label:has(#toggleAutoResolveInGame)")
        check(page.locator("#victoryBanner").is_visible(), "automatismi accesi: torna la vittoria")
        page.evaluate("closeGameMenuModal()")

        print("Riepilogo")
        page.click("#victoryBanner button:has-text('Riepilogo')")
        roles_txt = page.locator("#summaryRoles").inner_text()
        timeline_txt = page.locator("#summaryTimeline").inner_text()
        check("Anna" in roles_txt and "Lupo Mannaro" in roles_txt, "riepilogo: chi era chi")
        check("lupi hanno scelto Dario" in timeline_txt and "Veggente ha indagato su Anna" in timeline_txt, "cronologia: scelte della notte")
        check("Bruciato al rogo: Anna" in timeline_txt, "cronologia: rogo di Anna")
        page.evaluate("handleAndroidBack()")
        check(page.locator("#modalSummary").is_hidden(), "indietro chiude il riepilogo")
        page.click("text=✖ Continua")

        print("Anti-amnesia")
        cards.nth(1).locator("button[title='Mostra carta ruolo a questo giocatore']").click()
        check(page.locator("#modalAntiAmnesiaSafeView").is_visible(), "schermata coperta")
        shown, hidden = hold(page, "#btnAaReveal", "#aaStepCard")
        check(shown and hidden, "ruolo dell'anti-amnesia solo col dito premuto")
        check("Veggente" in page.locator("#aaRoleName").inner_text(), "ruolo giusto mostrato")
        page.click("text=Fatto, torna al Narratore")

        # Indietro sul cruscotto: chiede se uscire
        check(page.evaluate("handleAndroidBack()") is True, "indietro sul cruscotto gestito")
        check(page.locator("#modalConfirm").is_visible(), "chiede conferma prima di uscire")
        page.evaluate("handleAndroidBack()")
        check(page.locator("#modalConfirm").is_hidden(), "indietro chiude la finestra")

        # Ricarica: la partita resta
        page.reload()
        page.wait_for_load_state("networkidle")
        check(page.locator("#resumeBanner").is_visible(), "partita salvata dopo la riapertura")
        page.click("text=Riprendi Partita in Corso")
        check("Giorno 1" in page.locator("#narratorPhaseBadge").inner_text(), "ripresa al Giorno 1")

        # Torna al setup: chiede conferma solo se la partita non è finita (qui è finita: lupo morto)
        page.click("#btnSettingsTop")
        page.click("#modalGameMenu button:has-text('Torna al Setup')")
        check(page.locator("#screenSetup").is_visible(), "torna al setup")
        page.click("#setupStepper .setup-step[data-step='1']")
        page.locator(".player-chip").nth(5).locator(".player-chip-remove").click()
        page.fill("#playerNameInput", "Fa")
        page.evaluate("renderNameSuggestions()")
        check(page.locator(".name-suggestion:has-text('Fabio')").is_visible(), "Fabio suggerito mentre scrivi 'Fa'")
        page.click(".name-suggestion:has-text('Fabio')")
        check("Fabio" in page.locator("#playerChipsList").inner_text() and page.input_value("#playerNameInput") == "", "nome suggerito aggiunto con un tocco")

        print("Equilibrio del mazzo e preset")
        page.click("#btnSetupNext")
        page.locator(".preset-item").first.click()
        check(page.locator("#deckBalance").is_visible() and "equilibrata" in page.locator("#deckBalanceLabel").inner_text(), "preset: partita equilibrata")
        check(page.locator(".preset-item").count() == 3 and page.locator(".preset-desc").count() == 3, "3 preset, ognuno con la sua descrizione")
        page.click("#tabBtnCustom")
        page.evaluate("changeCustomRoleQty('lupo', 1); changeCustomRoleQty('lupo', 1)")
        check("a favore dei lupi" in page.locator("#deckBalanceLabel").inner_text(), "più lupi: la bilancia pende verso i lupi")
        marker = page.evaluate("parseFloat(document.getElementById('deckBalanceMarker').style.left)")
        check(marker < 30, "il segno della bilancia va verso i lupi")
        page.click("#tabBtnPresets")
        page.locator(".preset-item").first.click()

        print("Strega e Cacciatore")
        page.evaluate(
            """() => {
              appSettings.selectedDeck = { lupo: 1, strega: 1, cacciatore: 1, contadino: 3 };
              startDistributionPhase(); beginNarratorMatch();
              const roles = ['lupo', 'strega', 'cacciatore', 'contadino', 'contadino', 'contadino'];
              activeMatch.players.forEach((p, i) => { p.roleId = roles[i]; p.originalRoleId = roles[i]; });
              activeMatch.initialDeckMap = { ...appSettings.selectedDeck };
              saveMatchToStorage(); renderNarratorDashboard();
            }"""
        )
        names = page.evaluate("activeMatch.players.map(p => p.name)")
        anna, bruno, carla, dario, elena = names[0], names[1], names[2], names[3], names[4]
        check([c.strip() for c in page.locator(".guide-chip").all_inner_texts()][1:3] == ["🐺 Lupi", "🧪 Strega"], "la Strega viene chiamata dopo i lupi")
        nxt()
        target(dario).click()
        nxt()
        check("Pozione della vita" in guide() and f"Salva {dario}" in guide(), "la Strega vede la vittima dei lupi")
        page.click("#guideStep .potion-btn")
        check("salvato con la pozione" in guide(), "pozione della vita usata")
        target(elena).click()
        check("Avvelenato" in guide(), "pozione della morte usata")
        nxt()
        check("salvato dalla pozione" in guide() and f"{elena} muore" in guide(), "l'alba tiene conto delle pozioni")
        page.click("#guideBottomBar button:has-text('Fai sorgere il Giorno 1')")
        alive = page.evaluate("Object.fromEntries(activeMatch.players.map(p => [p.name, !p.isDead]))")
        check(alive[dario] and not alive[elena], "salvato dalla Strega vivo, avvelenato morto")
        check(sorted(page.evaluate("activeMatch.usedPowers.p_1")) == ["witch-kill", "witch-save"], "pozioni segnate come usate")
        page.evaluate("advanceToNight(); guideJump('role:strega')")
        check("già usato entrambe le pozioni" in guide(), "notte 2: pozioni finite")
        page.click("#btnUndoTop")
        check("Giorno 1" in page.locator("#narratorPhaseBadge").inner_text(), "di nuovo al Giorno 1")

        page.click("#tabBtnPlayers")
        cards.nth(2).locator("button[title='Elimina / Uccidi giocatore']").click()
        page.click("#modalDeathCause button:has-text('Bruciato al rogo')")
        shot = page.locator("#narratorPlayersList .death-shot-card")
        check(shot.is_visible() and "chi porta con sé" in shot.inner_text(), "il Cacciatore morto sceglie chi portare con sé")
        page.click("#tabBtnGuide")
        check(page.locator("#guideStep .death-shot-card").is_visible(), "lo stesso riquadro c'è anche nella guida")
        page.locator(f"#guideStep .death-shot-card .target-btn:has-text('{anna}')").click()
        check(page.evaluate("activeMatch.players[0].isDead && activeMatch.players[0].killedBy === 'p_2'"), "il lupo è stato portato via dal Cacciatore")
        check(page.locator("#undoToast").is_visible(), "si può annullare il colpo")
        check("VILLAGGIO" in page.locator("#victoryBannerText").inner_text(), "dopo il colpo vince il villaggio")
        page.click("#tabBtnPlayers")
        check("Portato via da" in page.locator("#narratorPlayersList").inner_text(), "la scheda dice chi l'ha portato via")
        page.click("#tabBtnGuide")

        print("Vista per il tavolo")
        page.click("#btnTableTop")
        table = page.locator("#tableView")
        table_text = table.inner_text()
        check(table.is_visible() and "Giorno 1" in table_text and page.locator("#tableTimer").is_visible(), "vista per il tavolo con fase e timer")
        check(not any(r in table_text for r in ["Lupo", "Cacciatore", "Strega", "Contadino"]), "nella vista per il tavolo nessun ruolo")
        check(page.locator("#tablePlayers .table-player.dead").count() == 3 and page.locator("#tableAliveCount").inner_text() == "3", "vivi e morti al tavolo")
        check(page.evaluate("handleAndroidBack()") is True and table.is_visible(), "Indietro non esce dalla vista per il tavolo")
        page.click("#tableTimerPlay")
        check("Pausa" in page.locator("#tableTimerPlay").inner_text(), "il timer parte anche dal tavolo")
        page.click("#tableTimerPlay")
        box = page.locator("#btnTableExit").bounding_box()
        page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
        page.mouse.down()
        page.mouse.up()
        check(table.is_visible(), "un tocco veloce non fa uscire")
        page.mouse.down()
        page.wait_for_timeout(1100)
        page.mouse.up()
        check(table.is_hidden(), "tenendo premuto si torna al Narratore")
        page.click("#btnSettingsTop")
        page.click("#modalGameMenu button:has-text('Torna al Setup')")
        check(page.locator("#screenSetup").is_visible(), "torna al setup")

        print("Narratore: livello, voce e suoni")
        page.click("#setupStepper .setup-step[data-step='3']")
        check(page.locator(".level-choice.active").first.get_attribute("data-level") == "beginner", "Narratore principiante di partenza")
        check(not page.locator("#toggleVoice").is_checked() and page.locator("#toggleSounds").is_checked(), "voce spenta e suoni accesi di partenza")
        durations = page.evaluate("LupusSounds.names.map(n => LupusSounds.play(n))")
        check(len(durations) == 6 and all(d > 0 for d in durations), "tutti i suoni si possono suonare")
        page.click("#screenSetup summary:has-text('Varianti')")
        check(page.locator("#optTieRule option").count() == 3, "3 regole per il pareggio")

        def new_match(deck, roles, setup=""):
            page.evaluate(
                """([deck, roles, setup]) => {
                  appSettings.selectedDeck = deck;
                  eval(setup);
                  startDistributionPhase(); beginNarratorMatch();
                  activeMatch.players.forEach((p, i) => { p.roleId = roles[i]; p.originalRoleId = roles[i]; });
                  activeMatch.initialDeckMap = { ...deck };
                  saveMatchToStorage(); renderNarratorDashboard();
                }""",
                [deck, roles, setup],
            )

        print("Varianti: mazzo annunciato, ruoli svelati, pareggio")
        page.click("label:has(#toggleDeckAnnounced)")
        page.click("label:has(#toggleRevealDead)")
        check(page.evaluate("appSettings.deckAnnounced && appSettings.revealDead"), "varianti accese dagli interruttori")
        page.select_option("#optTieRule", "decider")
        new_match({"lupo": 1, "veggente": 1, "sindaco": 1, "contadino": 3}, ["lupo", "veggente", "sindaco", "contadino", "contadino", "contadino"])
        check("In questa partita ci sono: Lupo Mannaro, Veggente, Sindaco e Contadino (3)" in guide(), "notte 1: si annunciano i ruoli in gioco")
        check(page.locator("#guideStep .guide-tip").count() >= 1 and page.locator("#guideStep .guide-tip").first.is_visible(), "il principiante vede i consigli")
        check(page.locator("#guideStep .phrase-say").count() >= 2, "ogni frase ha il pulsante 🔊")
        page.locator("#guideStep .phrase-say").first.click()
        nxt()
        check(page.evaluate("lastNarratedKey") == "1|night|role:veggente", "la voce segue i passi della guida")
        page.evaluate("guideJump('wolves')")
        target(names[3]).click()
        page.click("#guideBottomBar button:has-text('Avanti')")
        page.click("#guideBottomBar button:has-text('Fai sorgere il Giorno 1')")
        check(f"Il ruolo di {names[3]} era: 🧑‍🌾 Contadino" in guide(), "al mattino si svela il ruolo del morto")
        page.evaluate("guideJump('vote')")
        page.click("#guideStep button:has-text('Apri la votazione')")
        page.locator(f"#votePicker .target-btn:has-text('{names[1]}')").click()
        page.locator(f"#votePicker .target-btn:has-text('{names[0]}')").click()
        actions = page.locator("#voteActions").inner_text()
        check("Pareggio" in actions and f"Decide {names[2]}" in actions, "pareggio: decide chi ha il voto doppio")
        page.click(f"#voteActions button:has-text('Brucia {names[0]}')")
        check(f"Il ruolo di {names[0]} era: 🐺 Lupo Mannaro" in guide(), "al rogo si svela il ruolo")
        page.evaluate("onTieRuleChange('none'); activeMatch.players[0].isDead = false; activeMatch.players[0].deathCause = null; saveMatchToStorage(); renderNarratorDashboard(); openVoteModal()")
        check("nessuno va al rogo" in page.locator("#voteActions").inner_text(), "pareggio: con la regola 'nessuno' non brucia nessuno")
        page.evaluate("closeVoteModal()")
        page.evaluate("onMatchOptionToggle('deckAnnounced', false); onMatchOptionToggle('revealDead', false); onTieRuleChange('runoff')")

        print("Eventi a sorpresa")
        page.evaluate("onMatchOptionToggle('surpriseEvents', true)")
        new_match({"lupo": 1, "veggente": 1, "strega": 1, "contadino": 3}, ["lupo", "veggente", "strega", "contadino", "contadino", "contadino"])
        check("iniziano dalla seconda notte" in guide(), "notte 1: niente eventi")
        page.evaluate("setSurpriseEvent(findSurpriseEvent('luna_rossa'))")
        check("Luna rossa" in guide() and page.locator("#guideStep .event-card").is_visible(), "evento mostrato all'inizio della notte")
        page.evaluate("guideJump('wolves')")
        check("due" in guide() and "(0 di 2)" in guide(), "Luna rossa: i lupi scelgono due vittime")
        target(names[3]).click()
        target(names[4]).click()
        check("(2 di 2)" in guide(), "due vittime scelte")
        target(names[5]).click()
        check("(2 di 2)" in guide(), "non più di due")
        page.evaluate("guideJump('role:strega')")
        check(page.locator("#guideStep .potion-btn").count() == 2, "la Strega vede entrambe le vittime")
        page.evaluate("guideJump('dawn')")
        check(f"{names[3]}</strong> muore" in page.locator("#guideStep").inner_html() and f"{names[4]}</strong> muore" in page.locator("#guideStep").inner_html(), "all'alba muoiono entrambi")
        page.evaluate("guideJump('intro')")
        page.click("#guideStep button:has-text('Niente evento')")
        check(page.locator("#guideStep .event-card").count() == 0, "evento tolto")
        page.evaluate("setSurpriseEvent(findSurpriseEvent('nebbia')); guideJump('role:veggente')")
        check("Nebbia" in guide() and page.locator("#guideStep .target-btn").count() == 0, "Nebbia: il Veggente non vede")
        page.evaluate("setSurpriseEvent(findSurpriseEvent('festa')); guideJump('dawn')")
        page.click("#guideBottomBar button:has-text('Fai sorgere il Giorno 1')")
        check("Festa al villaggio" in guide(), "al mattino si ricorda la festa")
        page.evaluate("guideJump('vote')")
        check(page.locator("#guideStep button:has-text('Apri la votazione')").count() == 0, "festa: niente votazione")
        page.evaluate("Math.random = () => 0; advanceToNight()")
        check(page.evaluate("activeMatch.event && activeMatch.event.turn === 2 && activeMatch.event.id !== 'festa'"), "notte 2: evento estratto, mai uguale a quello prima")
        page.reload()
        page.wait_for_load_state("networkidle")

        print("Narratore esperto")
        page.evaluate("goSetupStep(3)")
        page.click("#screenSetup .level-choice[data-level='expert']")
        page.click("text=Riprendi Partita in Corso")
        check(page.locator("#guideStep .guide-tip").count() >= 1 and not page.locator("#guideStep .guide-tip").first.is_visible(), "l'esperto non vede i consigli")
        check(page.evaluate("lastNarratedKey") == "2|night|intro", "ripresa della partita senza rileggere il passo")
        page.click("#btnSettingsTop")
        check(page.locator("#modalGameMenu .level-choice.active").get_attribute("data-level") == "expert", "livello anche nel menu ⚙️")
        page.evaluate("closeGameMenuModal(); setSurpriseEvent(null); guideJump('wolves')")
        page.locator("#guideStep .target-btn:not([disabled])").first.click()
        page.wait_for_timeout(1100)
        check(page.evaluate("activeMatch.guideKey") == "role:strega", "esperto: dopo la scelta dei lupi va avanti da solo")
        page.evaluate("guideJump('role:veggente')")
        page.locator("#guideStep .target-btn:not([disabled])").first.click()
        page.wait_for_timeout(1100)
        check(page.evaluate("activeMatch.guideKey") == "role:veggente", "esperto: col Veggente aspetta, serve la risposta")
        page.click("#btnSettingsTop")
        page.click("#modalGameMenu .level-choice[data-level='beginner']")
        page.click("#modalGameMenu button:has-text('Torna al Setup')")

        print("Gufo e statistiche")
        page.evaluate("onMatchOptionToggle('surpriseEvents', false)")
        stats_before = page.evaluate("loadStats().length")
        new_match({"lupo": 1, "gufo": 1, "veggente": 1, "contadino": 3}, ["lupo", "gufo", "veggente", "contadino", "contadino", "contadino"])
        page.evaluate("guideJump('role:gufo')")
        target(names[3]).click()
        page.evaluate("guideJump('dawn')")
        page.click("#guideBottomBar button:has-text('Fai sorgere il Giorno 1')")
        check("oggi parte con un voto contro" in guide(), "al mattino si annuncia la scelta del Gufo")
        page.evaluate("guideJump('vote')")
        check(f"{names[3]} parte con un voto contro" in guide(), "il passo del voto lo ricorda")
        page.click("#guideStep button:has-text('Apri la votazione')")
        check("+1 dalla notte" in page.locator("#voteTally").inner_text(), "nella votazione il Gufo dà un voto contro")
        page.locator(f"#votePicker .target-btn:has-text('{names[0]}')").click()
        page.locator(f"#votePicker .target-btn:has-text('{names[0]}')").click()
        page.locator(f"#votePicker .target-btn:has-text('{names[0]}')").click()
        check(f"Brucia {names[0]} (3 voti)" in page.locator("#voteActions").inner_text(), "i voti veri contano più di quello del Gufo")
        page.click(f"#voteActions button:has-text('Brucia {names[0]}')")
        check("VILLAGGIO" in page.locator("#victoryBannerText").inner_text(), "lupo bruciato: vince il villaggio")
        check(page.evaluate("loadStats().length") == stats_before + 1 and page.evaluate("loadStats()[0].winner") == "village", "la partita finisce nelle statistiche")
        page.click("#undoToast .undo-toast-btn")
        check(page.evaluate("loadStats().length") == stats_before, "se si annulla il rogo, la partita esce dalle statistiche")
        page.click("#guideStep button:has-text('Apri la votazione')")
        page.click(f"#voteActions button:has-text('Brucia {names[0]}')")
        page.click("#victoryBanner button:has-text('Torna al Setup')")
        page.click("#setupStepper .setup-step[data-step='2']")
        check(page.locator("#deckStats").is_visible() and "1 partita" in page.locator("#deckStats").inner_text(), "nel mazzo: le vostre partite con questo mazzo")
        page.click("#btnInfoTop")
        check("Villaggio" in page.locator("#infoStats").inner_text(), "in ℹ️ il riassunto delle partite")
        page.evaluate("closeInfoModal()")
        page.evaluate("onMatchOptionToggle('surpriseEvents', false)")

        print("Senza Narratore")
        page.evaluate("goSetupStep(3)")
        page.click("#screenSetup .mode-choice[data-mode='auto']")
        check(page.locator("label:has(#toggleAutoResolve)").is_hidden() and page.locator("#screenSetup .level-switch").is_hidden(), "senza Narratore: niente opzioni da Narratore")
        check("Senza Narratore" in page.locator("#stickyDeckStatus").inner_text(), "la barra in basso lo ricorda")
        check(page.locator("#seatOrderHint").is_visible() and "Anna → Bruno" in page.locator("#seatOrderHint").inner_text(), "si spiega l'ordine dei posti")
        page.click("#setupStepper .setup-step[data-step='1']")
        check("ordine in cui siete seduti" in page.locator("#playersSubtitle").inner_text(), "i giocatori vanno scritti in ordine di posto")
        handle = page.locator("#playerChipsList .player-chip").nth(2).locator(".drag-handle").bounding_box()
        first = page.locator("#playerChipsList .player-chip").first.bounding_box()
        page.mouse.move(handle["x"] + handle["width"] / 2, handle["y"] + handle["height"] / 2)
        page.mouse.down()
        for k in range(1, 9):
            page.mouse.move(handle["x"] + handle["width"] / 2, handle["y"] + handle["height"] / 2 + (first["y"] + 4 - handle["y"] - handle["height"] / 2) * k / 8)
        page.mouse.up()
        check(page.evaluate("setupPlayers[0]") == "Carla", "trascinando ☰ si cambia l'ordine dei posti")
        page.click("#undoToast .undo-toast-btn")
        check(page.evaluate("setupPlayers[0]") == "Anna", "Annulla rimette i posti come prima")
        page.evaluate("goSetupStep(3)")
        new_match({"lupo": 2, "strega": 1, "veggente": 1, "sindaco": 1, "contadino": 1}, ["lupo", "strega", "lupo", "veggente", "sindaco", "contadino"])
        check(page.locator(".narrator-tabs").is_hidden() and page.locator(".alive-counters").is_hidden(), "niente scheda Giocatori né contatori dei lupi")
        check("il telefono passerà a tutti" in guide(), "notte: si spiega come passare il telefono")
        page.click("#btnSettingsTop")
        page.click("#modalGameMenu button:has-text('Riepilogo')")
        check(page.locator("#modalSummary").is_hidden(), "di notte, senza Narratore, il riepilogo dei ruoli è bloccato")
        page.evaluate("closeGameMenuModal()")
        page.click("#guideBottomBar button")
        def secret_turn(who, action):
            check(who in guide() and "Passa il telefono a" in guide(), f"il telefono va a {who}")
            page.click("#guideBottomBar button")
            action()
            page.evaluate("passActionStart = Date.now() - 7000; updatePassDoneButton()")
            done = page.locator("#btnPassDone")
            check(done.is_enabled(), f"{who} ha finito la sua mossa")
            done.click()
        def wolf1():
            check("Il tuo branco" in guide() and page.locator("#guideBottomBar button").is_disabled(), "il lupo vede il branco e deve scegliere")
            target(names[5]).click()
            check(page.locator("#btnPassDone").is_disabled() and "Fatto tra" in page.locator("#btnPassDone").inner_text(), "tempo minimo uguale per tutti prima di passare il telefono")
        def witch():
            page.click("#guideStep button:has-text('Sì, salvala')")
            page.click("#guideStep button:has-text('Nessuno')")
        def wolf2():
            check(f"{names[0]} → {names[5]}" in guide(), "il secondo lupo vede la scelta del primo")
            target(names[5]).click()
        def seer():
            target(names[0]).click()
            check("è un lupo" in guide(), "il Veggente ha subito la risposta")
        def decoy():
            check("Tocca un nome qualsiasi" in guide(), "chi non ha poteri fa una finta mossa")
            page.locator("#guideStep .target-btn").first.click()
        for who, action in zip(names, [wolf1, witch, wolf2, seer, decoy, decoy]):
            secret_turn(who, action)
        check("Fine della notte" in guide(), "dopo l'ultimo giocatore la notte finisce")
        page.click("#guideBottomBar button")
        check(page.evaluate("activeMatch.phase") == "day" and page.evaluate("activeMatch.players.every(p => !p.isDead)"), "la Strega ha salvato la vittima dei lupi")
        check("Voto doppio" not in guide(), "di giorno nessuna informazione segreta")
        page.evaluate("guideJump('vote')")
        page.click("#guideStep button:has-text('Apri la votazione')")
        check(page.locator("#voteVotersList").inner_text().count("vale 2") == 0, "nella votazione non si vede chi vale doppio")
        page.evaluate("closeVoteModal()")
        page.click("#btnSettingsTop")
        page.click("#modalGameMenu button:has-text('Torna al Setup')")
        page.evaluate("goSetupStep(3)")
        page.click("#screenSetup .mode-choice[data-mode='narrator']")

        print("Ruoli e informazioni")
        page.click("#setupStepper .setup-step[data-step='2']")
        page.click("text=Gestisci i ruoli")
        check(page.evaluate("rolesDB.length") == 18, "18 ruoli base")
        order = lambda: page.evaluate("getNightOrderRoles(rolesDB).map(r => r.id)")
        first = order()
        check(page.locator("#nightOrderList .night-order-item").count() == len(first), "elenco dell'ordine di chiamata")
        page.locator("#nightOrderList .night-order-item").first.locator(".order-btn").nth(1).click()
        check(order()[:2] == [first[1], first[0]], "▼ sposta il ruolo più avanti nella notte")
        check(page.locator("#undoToast").is_visible(), "cambio d'ordine annullabile")
        wolf_handle = page.locator("#nightOrderList .night-order-item[data-id='lupo'] .drag-handle")
        top = page.locator("#nightOrderList .night-order-item").first.bounding_box()
        box = wolf_handle.bounding_box()
        page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
        page.mouse.down()
        for step in range(1, 11):
            y = box["y"] + box["height"] / 2 + (top["y"] + 4 - box["y"] - box["height"] / 2) * step / 10
            page.mouse.move(box["x"] + box["width"] / 2, y)
        page.mouse.up()
        check(order()[0] == "lupo", "trascinando ☰ il Lupo diventa il primo chiamato")
        check(page.locator("#nightOrderList .night-order-item").first.get_attribute("data-id") == "lupo", "l'elenco si aggiorna")
        page.click("text=Crea Nuovo Ruolo")
        page.fill("#rfIcon", "🧑‍🌾")
        page.fill("#rfName", "Mugnaio")
        page.fill("#rfWhat", "Macina il grano.")
        page.click("text=Salva Ruolo")
        saved = page.evaluate("rolesDB.find(r => r.name === 'Mugnaio')")
        check(saved and saved["icon"] == "🧑‍🌾", "emoji composta salvata intera")

        # Ruolo personalizzato con azione notturna: la guida lo gestisce da sola
        page.click("text=Crea Nuovo Ruolo")
        page.fill("#rfName", "Strega")
        page.fill("#rfWhat", "Di notte avvelena un giocatore.")
        page.click("text=Salva Ruolo")
        check("Esiste già" in page.locator("#toastContainer").inner_text(), "non si possono avere due ruoli con lo stesso nome")
        page.fill("#rfName", "Avvelenatore")
        page.select_option("#rfWake", "mai")
        page.select_option("#rfNightAction", "kill")
        check(page.locator("#rfWake").input_value() == "ogni_notte", "con un'azione notturna si sveglia ogni notte")
        check(page.locator("#rfRulesBox").is_visible(), "regole della scelta visibili")
        page.check("#rfRule_notSelf")
        check(page.locator("#rfRule_onlyWolves").is_visible() and page.locator("#rfRule_oncePerGame").is_visible(), "regole nuove: solo un lupo, una volta per partita")
        page.click("text=Salva Ruolo")
        kinds = page.evaluate("""() => { const id = rolesDB.find(r => r.name === 'Avvelenatore').id;
          return buildNightPlan([{ id: 'x', name: 'X', roleId: id, isDead: false }, { id: 'y', name: 'Y', roleId: 'lupo', isDead: false }], rolesDB, 1).map(s => s.kind); }""")
        check(kinds == ["intro", "wolves", "kill", "dawn"], "il ruolo nuovo ha il suo passo nella guida")
        check(order()[-1] == page.evaluate("rolesDB.find(r => r.name === 'Avvelenatore').id"), "il ruolo nuovo viene chiamato per ultimo")
        check("uccide un giocatore" in page.locator("#editorRolesList").inner_text(), "l'elenco ruoli mostra cosa fa di notte")

        # Regole avanzate: un ruolo che quando muore porta con sé qualcuno e vota doppio
        page.click("text=Crea Nuovo Ruolo")
        check(not page.evaluate("document.getElementById('rfAdvanced').open"), "regole avanzate chiuse per un ruolo nuovo")
        page.fill("#rfName", "Vendicatore")
        page.fill("#rfWhat", "Se muori, porti qualcuno con te.")
        page.select_option("#rfWake", "mai")
        page.click("#rfAdvanced > summary")
        page.select_option("#rfDeathAction", "kill")
        page.check("#rfTrait_doubleVote")
        page.click("text=Salva Ruolo")
        avenger = page.evaluate("rolesDB.find(r => r.name === 'Vendicatore')")
        check(avenger["deathAction"] == "kill" and avenger["traits"]["doubleVote"], "regole avanzate salvate")
        check("porta con sé" in page.locator("#editorRolesList").inner_text(), "l'elenco ruoli mostra le capacità speciali")
        page.locator("#editorRolesList .card:has-text('Cacciatore') button[title='Modifica']").click()
        check(page.evaluate("document.getElementById('rfAdvanced').open") and page.locator("#rfDeathAction").input_value() == "kill", "il Cacciatore apre le regole avanzate già compilate")
        page.evaluate("closeRoleFormModal()")
        print("Condividere i ruoli")
        page.click("text=Condividi ruoli")
        check(page.locator("#shareRolesList input:checked").count() == 3, "preselezionati solo i ruoli creati (non quelli solo riordinati)")
        page.click("#btnShareRolesCopy")
        copied = page.evaluate("navigator.clipboard.readText()")
        check("LUPUS-RUOLI-1:" in copied and "Mugnaio" in copied, "messaggio copiato con il codice")
        page.evaluate("handleAndroidBack()")
        page.click("text=Importa ruoli")
        code = page.evaluate("""encodeRolesShare([{ name: 'Fornaio', icon: '🥖', faction: 'Villaggio', whatYouDo: 'Sforna il pane.', howYouWin: 'Col villaggio.', wakeTiming: 'mai', priority: 5 }, { name: 'Mugnaio', icon: '🌾', faction: 'Villaggio', whatYouDo: 'Testo nuovo.', howYouWin: 'Col villaggio.', wakeTiming: 'mai', priority: 5 }])""")
        page.fill("#importRolesText", "Ciao! " + code + " a presto")
        preview = page.locator("#importRolesPreview").inner_text()
        check("Fornaio" in preview and "nuovo" in preview and "aggiorna" in preview, "anteprima dell'importazione")
        page.click("#btnImportRolesConfirm")
        check(page.evaluate("rolesDB.some(r => r.name === 'Fornaio')"), "ruolo importato")
        check(page.evaluate("rolesDB.find(r => r.name === 'Mugnaio').whatYouDo") == "Testo nuovo.", "ruolo con lo stesso nome aggiornato")

        page.evaluate("handleAndroidBack()")
        check(page.locator("#screenSetup").is_visible(), "indietro dall'editor torna al setup")

        print("Guida")
        page.click("#screenSetup button:has-text('Guida')")
        guide = page.locator("#modalGuide").inner_text()
        check("come si gioca" in guide.lower() and "Lupo Mannaro" in guide and "Fornaio" in guide, "guida con regole e ruoli")
        page.evaluate("handleAndroidBack()")
        check(page.locator("#modalGuide").is_hidden(), "indietro chiude la guida")
        page.click("#btnInfoTop")
        check(page.locator("#modalInfo").is_visible(), "finestra informazioni")
        check("Versione" in page.locator("#infoVersion").inner_text(), "mostra la versione")
        check(page.locator(".info-qr").evaluate("img => img.complete && img.naturalWidth > 0"), "QR code per scaricare l'app")
        page.click("text=Novità delle ultime versioni")
        check(page.locator("#modalWhatsNew").is_visible() and "Versione 1." in page.locator("#whatsNewBody").inner_text(), "finestra novità")
        page.evaluate("handleAndroidBack()")
        check(page.locator("#modalWhatsNew").is_hidden(), "indietro chiude le novità")
        page.click("#btnInfoTop")
        page.evaluate("handleAndroidBack()")

        # Avviso aggiornamento simulato
        page.evaluate(
            """() => { localStorage.setItem('lupus_updates_v1', JSON.stringify({ lastCheck: new Date().toISOString(), latestVersion: '99.0.0', apkUrl: 'https://example.com/x.apk' })); renderUpdateBanner(); }"""
        )
        check(page.locator("#updateBanner").is_visible(), "avviso nuova versione")
        page.click("text=Più tardi")
        check(page.locator("#updateBanner").is_hidden(), "avviso nascosto con Più tardi")

        print("Backup")
        page.click("#btnInfoTop")
        with page.expect_download() as dl:
            page.click("#modalInfo button:has-text('Salva backup')")
        download = dl.value
        check(download.suggested_filename.startswith("lupus-backup-") and download.suggested_filename.endswith(".json"), "backup salvato in un file")
        backup_text = pathlib.Path(download.path()).read_text(encoding="utf-8")
        check('"lupus-backup"' in backup_text and "Mugnaio" in backup_text and "Anna" in backup_text, "nel backup ci sono ruoli e giocatori")
        page.evaluate("rolesDB = rolesDB.filter(r => r.name !== 'Mugnaio'); setupPlayers = ['X', 'Y']; saveRolesToStorage(); savePlayersToStorage(); renderSetupScreen()")
        page.click("#modalInfo button:has-text('Ripristina')")
        page.fill("#restoreText", "testo a caso")
        check("non è un file di backup" in page.locator("#restorePreview").inner_text() and page.locator("#btnRestoreConfirm").is_disabled(), "un testo sbagliato viene rifiutato")
        page.locator("#restoreFileInput").set_input_files({"name": "lupus-backup.json", "mimeType": "application/json", "buffer": backup_text.encode("utf-8")})
        page.wait_for_function("!document.getElementById('btnRestoreConfirm').disabled")
        check("ruoli" in page.locator("#restorePreview").inner_text() and "giocatori" in page.locator("#restorePreview").inner_text(), "anteprima del backup scelto")
        page.click("#btnRestoreConfirm")
        check(page.evaluate("rolesDB.some(r => r.name === 'Mugnaio') && setupPlayers.includes('Anna')"), "backup ripristinato")
        check(page.locator("#undoToast").is_visible(), "il ripristino si può annullare")

        print("Aggiornamento dalla versione 1.4")
        page.evaluate(
            """() => {
              const old = DEFAULT_ROLES.filter(r => ORIGINAL_DEFAULT_ROLE_IDS.includes(r.id)).map(r => {
                const c = { ...r }; ['wakesWithWolves', 'deathAction', 'victory', 'traits', 'markText'].forEach(k => delete c[k]); return c; });
              localStorage.setItem('lupus_narratore_roles_v1', JSON.stringify(old));
              const st = JSON.parse(localStorage.getItem('lupus_narratore_settings_v1'));
              st.selectedPresetCode = 'a'; delete st.knownDefaultRoleIds;
              localStorage.setItem('lupus_narratore_settings_v1', JSON.stringify(st));
            }"""
        )
        page.reload()
        page.wait_for_load_state("networkidle")
        check(page.evaluate("rolesDB.length") == 18 and page.evaluate("rolesDB.some(r => r.id === 'strega')"), "i 5 ruoli nuovi aggiunti a chi aveva la 1.4")
        check(page.evaluate("roleTraits(findRoleOrNull('sindaco')).doubleVote && findRoleOrNull('sindaco').traits.doubleVote"), "i ruoli vecchi ricevono le capacità")
        check(page.evaluate("appSettings.selectedPresetCode") != "a", "codice di preset vecchio dimenticato")
        page.evaluate("rolesDB = rolesDB.filter(r => r.id !== 'gufo'); saveRolesToStorage()")
        page.reload()
        page.wait_for_load_state("networkidle")
        check(page.evaluate("rolesDB.length") == 17, "un ruolo nuovo eliminato non torna più")

        print("Novità dopo l'aggiornamento")
        page.evaluate("localStorage.setItem('lupus_narratore_seen_version_v1', '1.0.0')")
        page.reload()
        page.wait_for_load_state("networkidle")
        check(page.locator("#modalWhatsNew").is_visible() and "Novità di Lupus" in page.locator("#whatsNewTitle").inner_text(), "dopo un aggiornamento compaiono le novità")
        page.click("#modalWhatsNew button:has-text('Ok, giochiamo')")
        page.reload()
        page.wait_for_load_state("networkidle")
        check(page.locator("#modalWhatsNew").is_hidden(), "le novità si vedono una volta sola")

        page.screenshot(path=str(DIST.parent / "tests" / "screenshot-setup.png"), full_page=False)
        browser.close()
    httpd.shutdown()

    real_errors = [e for e in errors if "favicon" not in e]
    if real_errors:
        print("ERRORI NELLA CONSOLE:\n" + "\n".join(real_errors))
        sys.exit(1)
    print("Tutto ok")


if __name__ == "__main__":
    main()
