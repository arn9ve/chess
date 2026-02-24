$(function() {
    var DEBUG_LOGS = false;
    function debugLog() {
        if (!DEBUG_LOGS || !window.console || typeof window.console.log !== 'function') {
            return;
        }
        window.console.log.apply(window.console, arguments);
    }
    function updateScoreGauge(score) {
        return score;
    }
    function currentEngineURL() {
        return $('input[name="engineMenu"]:checked').val() || "js/p4wn.js";
    }
    function currentLevel() {
        return $('input[name="engineMenu"]:checked').data('level') || 'easy';
    }
    function isEasyEngine() {
        return currentLevel() === 'easy';
    }
    function engineMoveTimeMs() {
        var configured = parseInt($('#moveTime').val(), 10);
        if (!configured || configured < 1) {
            configured = 5000;
        }
        if (isEasyEngine()) {
            return Math.min(configured, 120);
        }
        return configured;
    }
    function easyRandomMoveChance() {
        return 0.6;
    }

    var selectedEngineURL = $('input[name="engineMenu"]:checked').val() || "js/p4wn.js";
    var engine = new Worker(selectedEngineURL);
    debugLog("GUI: uci");
    engine.postMessage("uci");
    debugLog("GUI: ucinewgame");
    engine.postMessage("ucinewgame");

    var moveList = [], scoreList =[];

    var cursor = 0;

    var player = 'w';
    var entirePGN = ''; // longer than current PGN when rewind buttons are clicked

    var board;
    var game = new Chess(), // move validation, etc.
        statusEl = $('#status'),
        turnEl = $('#turns'),
        fenEl = $('#fen'),
        pgnEl = $('#pgn');
    var lastMoveOneIconEl = $('#lastMoveOneIcon');
    var lastMoveOneTextEl = $('#lastMoveOneText');
    var lastMoveTwoIconEl = $('#lastMoveTwoIcon');
    var lastMoveTwoTextEl = $('#lastMoveTwoText');
    var pgnBoxEl = $('#pgnBox');

    var gameMode = 'gate'; // gate | offline | host | guest
    var myColor = 'w';
    var peerNode = null;
    var peerConn = null;
    var hostRoomCode = '';
    var hostInviteLink = '';
    var waitingRotationId = null;
    var waitingRotationAngle = 0;

    var modeGateEl = $('#modeGate');
    var modeActionButtonsEl = $('#modeActionButtons');
    var modeHostPanelEl = $('#modeHostPanel');
    var hostStatusTextEl = $('#hostStatusText');
    var hostCodeInputEl = $('#hostCodeInput');
    var hostLinkInputEl = $('#hostLinkInput');
    var copyHostCodeBtnEl = $('#copyHostCodeBtn');
    var copyHostLinkBtnEl = $('#copyHostLinkBtn');
    var shareToastEl = $('#shareToast');
    var shareToastLinkEl = $('#shareToastLink');
    var shareToastStatusEl = $('#shareToastStatus');
    var shareToastCopyBtnEl = $('#shareToastCopyBtn');
    var shareToastCopyTextEl = $('#shareToastCopyText');
    var primaryActionRowEl = $('#primaryActionRow');
    var quickSettingsPanelEl = $('#quickSettingsPanel');
    var quickSettingsToggleBtnEl = $('#quickSettingsToggleBtn');
    var quickCloseBtnEl = $('#quickCloseBtn');
    var quickBoardBtnEl = $('#quickBoardBtn');
    var quickEasyBtnEl = $('#quickEasyBtn');
    var quick3DBtnEl = $('#quick3DBtn');
    var quickBoardTextEl = $('#quickBoardText');
    var quickEasyTextEl = $('#quickEasyText');
    var quick3DTextEl = $('#quick3DText');
    var quickPanelAnimating = false;

    // true for when the engine is processing; ignore_mouse_events is always true if this is set (also during animations)
    var engineRunning = false;

    // don't let the user press buttons while other button clicks are still processing
    var board3D = ChessBoard3.webGLEnabled();
    var boardInfoVisible = false;

    if (!board3D) {
        swal("WebGL unsupported or disabled.", "Using a 2D board...");
        $('#dimensionBtn').remove();
    }

    function isMultiplayer() {
        return gameMode === 'host' || gameMode === 'guest';
    }

    function isHost() {
        return gameMode === 'host';
    }

    function isGuest() {
        return gameMode === 'guest';
    }

    function disableEngineControlsForMultiplayer() {
        $('#hintBtn').prop('disabled', true).addClass('hide');
        $('input[name="engineMenu"]').prop('disabled', true);
    }

    function ensureEngineWorker() {
        if (engine) {
            return;
        }
        var selected = currentEngineURL();
        engine = new Worker(selected);
        debugLog("GUI: uci");
        engine.postMessage("uci");
        debugLog("GUI: ucinewgame");
        engine.postMessage("ucinewgame");
    }

    function hideModeGate() {
        modeGateEl.addClass('hidden');
    }
    
    function showModeGate() {
        modeGateEl.removeClass('hidden');
        hideShareToast();
        closeNetworking();
        gameMode = 'gate';
        myColor = 'w';
        player = 'w';
        ensureEngineWorker();
        $('#hintBtn').prop('disabled', false).removeClass('hide');
        $('input[name="engineMenu"]').prop('disabled', false);
        $('body').removeClass('waiting-mode');
        updateStatus();
    }
    
    function showShareToast(link) {
        shareToastLinkEl.text(link);
        shareToastStatusEl.text('');
        shareToastEl.removeClass('hide').addClass('visible');
        $('body').addClass('waiting-mode');
    }
    
    function hideShareToast() {
        shareToastEl.removeClass('visible');
        $('body').removeClass('waiting-mode');
        setTimeout(function() {
            shareToastEl.addClass('hide');
        }, 500);
    }
    
    function updateShareToastStatus(text) {
        shareToastStatusEl.text(text);
    }
    
    function flashCopyButton() {
        shareToastCopyBtnEl.addClass('copied');
        shareToastCopyTextEl.text('Copied!');
        setTimeout(function() {
            shareToastCopyBtnEl.removeClass('copied');
            shareToastCopyTextEl.text('Copy Link');
        }, 1500);
    }

    function showJoinInfo(text) {
        $('#joinInfo').removeClass('hide').html('<strong>Joining...</strong><br>' + text);
    }

    function setHostStatus(text) {
        hostStatusTextEl.text(text);
    }

    function showHostPanel() {
        modeActionButtonsEl.addClass('hide');
        modeHostPanelEl.removeClass('hide');
    }

    function showModeActions() {
        modeHostPanelEl.addClass('hide');
        modeActionButtonsEl.removeClass('hide');
    }

    function buildHostInvite(id) {
        var inviteURL = new URL(window.location.href);
        inviteURL.searchParams.set('join', id);
        hostRoomCode = id;
        hostInviteLink = inviteURL.toString();
        hostCodeInputEl.val(hostRoomCode);
        hostLinkInputEl.val(hostInviteLink);
    }

    function flashCopiedButton($btn) {
        var previous = $btn.text();
        $btn.text('Copied');
        setTimeout(function() {
            $btn.text(previous);
        }, 1200);
    }

    function showQuickSettings() {
        primaryActionRowEl.addClass('hide');
        quickSettingsPanelEl.removeClass('hide');
        primaryActionRowEl.removeClass('quick-panel-enter quick-panel-leave');
        quickSettingsPanelEl.removeClass('quick-panel-enter quick-panel-leave');
    }

    function hideQuickSettings() {
        quickSettingsPanelEl.addClass('hide');
        primaryActionRowEl.removeClass('hide');
        primaryActionRowEl.removeClass('quick-panel-enter quick-panel-leave');
        quickSettingsPanelEl.removeClass('quick-panel-enter quick-panel-leave');
    }

    function swapQuickPanels(fromEl, toEl) {
        if (quickPanelAnimating) {
            return;
        }
        if (fromEl.hasClass('hide') || !toEl.hasClass('hide')) {
            return;
        }
        quickPanelAnimating = true;
        fromEl.addClass('quick-panel-leave');
        setTimeout(function() {
            fromEl.addClass('hide').removeClass('quick-panel-leave');
            toEl.removeClass('hide').addClass('quick-panel-enter');
            requestAnimationFrame(function() {
                toEl.removeClass('quick-panel-enter');
            });
            setTimeout(function() {
                quickPanelAnimating = false;
            }, 230);
        }, 220);
    }

    function showQuickSettingsAnimated() {
        swapQuickPanels(primaryActionRowEl, quickSettingsPanelEl);
    }

    function hideQuickSettingsAnimated() {
        swapQuickPanels(quickSettingsPanelEl, primaryActionRowEl);
    }

    function rebuildBoardPreservingState() {
        if (!board) {
            return;
        }
        var position = board.position();
        var orientation = board.orientation();
        board.destroy();
        board = createBoard($('#piecesMenu').val());
        board.orientation(orientation);
        board.position(position, false);
        adjustBoardWidth();
    }

    function updateQuickSettingsLabels() {
        quickBoardTextEl.text('Board');
        quickBoardBtnEl.toggleClass('quick-box-off', !boardInfoVisible);
        quickBoardBtnEl.attr('aria-pressed', boardInfoVisible ? 'true' : 'false');
        quickEasyTextEl.text((currentLevel() || 'easy').replace(/^./, function(c) { return c.toUpperCase(); }));
        quick3DTextEl.text(board3D ? '3D' : '2D');
    }

    function copyText(text) {
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text);
            return;
        }
        var tmp = document.createElement('textarea');
        tmp.value = text;
        tmp.style.position = 'fixed';
        tmp.style.opacity = '0';
        document.body.appendChild(tmp);
        tmp.focus();
        tmp.select();
        document.execCommand('copy');
        document.body.removeChild(tmp);
    }

    function stopEngineForMultiplayer() {
        if (engine) {
            engine.terminate();
            engine = null;
        }
        engineRunning = false;
    }

    function closeNetworking() {
        if (peerConn) {
            try {
                peerConn.close();
            } catch (e) {
                debugLog('peerConn close ignored', e);
            }
            peerConn = null;
        }
        if (peerNode) {
            try {
                peerNode.destroy();
            } catch (e2) {
                debugLog('peerNode destroy ignored', e2);
            }
            peerNode = null;
        }
    }

    function resetLocalGamePosition() {
        game = new Chess();
        moveList = [];
        scoreList = [];
        cursor = 0;
        if (board) {
            board.start();
            board.orientation(myColor === 'w' ? 'white' : 'black');
        }
        updateStatus();
    }

    function sendPeerMessage(type, payload) {
        if (!peerConn || !peerConn.open) {
            return;
        }
        var message = payload || {};
        message.type = type;
        peerConn.send(message);
    }

    function applyRemoteMove(moveData) {
        if (!moveData) {
            return;
        }
        var move = game.move(moveData);
        if (!move) {
            return;
        }
        moveList.push(move);
        scoreList.push(0);
        cursor = moveList.length;
        board.position(game.fen(), true);
        updateStatus();
    }

    function bindPeerConnection(conn) {
        peerConn = conn;
        peerConn.on('open', function() {
            if (isHost()) {
                sendPeerMessage('init', {
                    fen: game.fen(),
                    color: 'b'
                });
                updateShareToastStatus('Friend connected! Game starting...');
                setTimeout(function() {
                    hideShareToast();
                }, 3000);
            } else {
                hideShareToast();
            }
            updateStatus();
        });
        peerConn.on('data', function(data) {
            if (!data || !data.type) {
                return;
            }
            if (data.type === 'init' && isGuest()) {
                myColor = data.color === 'w' ? 'w' : 'b';
                player = myColor;
                game = data.fen ? new Chess(data.fen) : new Chess();
                board.position(game.fen(), false);
                board.orientation(myColor === 'w' ? 'white' : 'black');
                moveList = [];
                scoreList = [];
                cursor = 0;
                updateStatus();
            } else if (data.type === 'move') {
                applyRemoteMove(data.move);
            } else if (data.type === 'reset') {
                resetLocalGamePosition();
            }
        });
        peerConn.on('close', function() {
            if (isHost()) {
                showShareToast(hostInviteLink);
                updateShareToastStatus('Friend disconnected. Share the link again to reconnect.');
            } else {
                swal("Connection closed", "Your friend disconnected.", "info");
            }
            updateStatus();
        });
        peerConn.on('error', function() {
            swal("Connection error", "Unable to sync match state.", "error");
        });
    }

    function startOfflineMode() {
        closeNetworking();
        showModeActions();
        hideQuickSettings();
        gameMode = 'offline';
        myColor = 'w';
        player = 'w';
        ensureEngineWorker();
        hideModeGate();
        updateStatus();
    }

    function startHostingMode() {
        if (typeof window.Peer !== 'function') {
            swal("Unavailable", "Game Host needs network support.", "error");
            return;
        }
        closeNetworking();
        gameMode = 'host';
        myColor = 'w';
        player = 'w';
        disableEngineControlsForMultiplayer();
        stopEngineForMultiplayer();
        hideModeGate();
        hideQuickSettings();
        updateStatus();

        peerNode = new Peer();
        peerNode.on('open', function(id) {
            buildHostInvite(id);
            showShareToast(hostInviteLink);
            updateShareToastStatus('Share the link with a friend to start playing');
        });
        peerNode.on('connection', function(conn) {
            if (peerConn && peerConn.open) {
                conn.close();
                return;
            }
            bindPeerConnection(conn);
        });
        peerNode.on('error', function() {
            updateShareToastStatus('Unable to create room. Please try again.');
        });
    }

    function startGuestMode(hostId) {
        if (!hostId || typeof window.Peer !== 'function') {
            startOfflineMode();
            return;
        }
        closeNetworking();
        gameMode = 'guest';
        myColor = 'b';
        player = 'b';
        disableEngineControlsForMultiplayer();
        stopEngineForMultiplayer();
        hideModeGate();
        hideQuickSettings();
        showShareToast(window.location.href);
        updateShareToastStatus('Connecting to host...');
        updateStatus();

        peerNode = new Peer();
        peerNode.on('open', function() {
            var conn = peerNode.connect(hostId, { reliable: true });
            bindPeerConnection(conn);
        });
        peerNode.on('error', function() {
            updateShareToastStatus('Unable to connect. Check the link and try again.');
            setTimeout(function() {
                swal("Join error", "Unable to connect to host link.", "error");
            }, 1000);
        });
    }

 

    function adjustBoardWidth() {
        var windowWidth = $(window).width();
        var windowHeight = $(window).height();
        var desiredBoardWidth = windowWidth;
        var desiredBoardHeight = windowHeight;

        var boardDiv = $('#board');
        if (board3D) {
            // Use full viewport space in 3D mode.
            boardDiv.css('width', desiredBoardWidth);
            boardDiv.css('height', desiredBoardHeight);
        } else {
            // This is a chessboard.js board. Adjust for 1:1 aspect ratio
            desiredBoardWidth = Math.min(desiredBoardWidth, desiredBoardHeight);
            boardDiv.css('width', desiredBoardWidth);
            boardDiv.css('height', desiredBoardHeight);
        }
        if (board !== undefined) {
            board.resize();
        }
    }

    function fireEngine() {
        if (!engine || isMultiplayer()) {
            return;
        }
        engineRunning = true;
        updateStatus();
        var currentScore;

        function applyEngineMove(moveObj) {
            var move = game.move(moveObj);
            if (!move) {
                engineRunning = false;
                updateStatus();
                return;
            }
            moveList.push(move);
            if (currentScore !== undefined) {
                if (scoreList.length > 0) {
                    scoreList.pop(); // remove the dummy score for the user's prior move
                    scoreList.push(currentScore); // Replace it with the engine's opinion
                }
                scoreList.push(currentScore);// engine's response
            } else {
                scoreList.push(0); // not expected
            }
            cursor++;
            board.position(game.fen(), true);
            engineRunning = false;
            updateStatus();
        }

        if (isEasyEngine() && Math.random() < easyRandomMoveChance()) {
            var legalMoves = game.moves({ verbose: true });
            if (legalMoves && legalMoves.length > 0) {
                var randomMove = legalMoves[Math.floor(Math.random() * legalMoves.length)];
                applyEngineMove({
                    from: randomMove.from,
                    to: randomMove.to,
                    promotion: randomMove.promotion
                });
                return;
            }
        }

        var msg = "position fen "+game.fen();
        debugLog("GUI: "+msg);
        engine.postMessage(msg);
        msg = 'go movetime ' + engineMoveTimeMs();
        debugLog("GUI: "+msg);
        engine.postMessage(msg);
        engine.onmessage = function(event) {
            var line = event.data;
            debugLog("ENGINE: "+line);
            var best = parseBestMove(line);
            if (best !== undefined) {
                applyEngineMove(best);
            } /* else {
                // Before the move gets here, the engine emits info responses with scores
                var score = parseScore(line);
                if (score !== undefined) {
                    if (player === 'w') {
                        score = -score; // convert from engine's score to white's score
                    }
                    updateScoreGauge(score);
                    currentScore = score;
                }
            } */
        };
    }

    function parseBestMove(line) {
        var match = line.match(/bestmove\s([a-h][1-8][a-h][1-8])(n|N|b|B|r|R|q|Q)?/);
        if (match) {
            var bestMove = match[1];
            var promotion = match[2];
            return {
                from: bestMove.substring(0, 2),
                to: bestMove.substring(2, 4),
                promotion: promotion
            }
        }
    }

    function parseScore(line) {
        var match = line.match(/score\scp\s(-?\d+)/);
        if (match) {
            return match[1];
        } else {
            if (line.match(/mate\s-?\d/)) {
                return 2500;
            }
        }
    }

    function pieceSprite(move) {
        if (!move || !move.color || !move.piece) {
            return 'img/chesspieces/alpha/wP.png';
        }
        var color = move.color === 'b' ? 'b' : 'w';
        var piece = (move.piece + '').toUpperCase();
        return 'img/chesspieces/alpha/' + color + piece + '.png';
    }

    function moveText(move) {
        if (!move || !move.from || !move.to) {
            return '--';
        }
        return move.to.toUpperCase();
    }

    function renderLastMovesUI() {
        var latest = moveList.length ? moveList[moveList.length - 1] : null;
        var previous = moveList.length > 1 ? moveList[moveList.length - 2] : null;

        if (previous) {
            lastMoveOneIconEl.attr('src', pieceSprite(previous));
            lastMoveOneTextEl.text(moveText(previous));
        } else {
            lastMoveOneIconEl.attr('src', 'img/chesspieces/alpha/wP.png');
            lastMoveOneTextEl.text('--');
        }

        if (latest) {
            lastMoveTwoIconEl.attr('src', pieceSprite(latest));
            lastMoveTwoTextEl.text(moveText(latest));
        } else {
            lastMoveTwoIconEl.attr('src', 'img/chesspieces/alpha/bP.png');
            lastMoveTwoTextEl.text('--');
        }
    }

    function updateStatus() {

        var status = '';
        var turns = '';

        var moveColor = 'White';
        if (game.turn() === 'b') {
            moveColor = 'Black';
        }

        if (game.game_over()) {

            if (game.in_checkmate()) {
                status = moveColor + ' mated';
            } else if (game.in_stalemate()) {
                status = "Stalemate";
            } else if (game.insufficient_material()) {
                status = "Draw: Material";
            } else if (game.in_threefold_repetition()) {
                status = "Draw: Repetition";
            } else if (game.in_draw()) {
                status = "Draw: 50-move";
            }
            swal({
                title : "Game Over",
                text : status,
                type: 'info',
                showCancelButton: false,
                confirmButtonColor: "#DD6655",
                onConfirmButtonText: 'OK',
                closeOnConfirm: true
            });
            engineRunning = false;
        }

        // game still on
        else {
            if (isMultiplayer()) {
                if (!peerConn || !peerConn.open) {
                    status = moveColor + " turn • Join...";
                } else {
                    status = moveColor + " turn";
                }
                turns = "Online Match";
            } else {
                status = moveColor + " turn";
                turns = "";
            }

            // check?
            if (game.in_check() === true) {
                status += ' • Check';
            }
        }

        fenEl.html(game.fen().replace(/ /g, '&nbsp;'));
        var currentPGN = game.pgn({max_width:10,newline_char:"<br>"});
        var matches = entirePGN.lastIndexOf(currentPGN, 0) === 0;
        if (matches) {
            currentPGN += "<span>" + entirePGN.substring(currentPGN.length, entirePGN.length) + "</span>";
        } else {
            entirePGN = currentPGN;
        }
        pgnEl.html(currentPGN);
        pgnBoxEl.toggleClass('hide', moveList.length === 0);
        if (!isMultiplayer() && engineRunning) {
            status += ' • Think';
        }
        statusEl.html(status);
        turnEl.html(turns);
        renderLastMovesUI();
    };

    // Set up chessboard
    var onDrop = function(source, target) {
        if (engineRunning) {
            return 'snapback';
        }
        if (isMultiplayer() && (!peerConn || !peerConn.open)) {
            return 'snapback';
        }
        if (isMultiplayer() && game.turn() !== myColor) {
            return 'snapback';
        }
        if (board.hasOwnProperty('removeGreySquares') && typeof board.removeGreySquares === 'function') {
            board.removeGreySquares();
        }

        // see if the move is legal
        var move = game.move({
            from: source,
            to: target,
            promotion: $("#promotion").val()
        });

        // illegal move
        if (move === null) return 'snapback';
        if (cursor === 0 && engine && !isMultiplayer()) {
            debugLog("GUI: ucinewgame");
            engine.postMessage("ucinewgame");
        }
        moveList = moveList.slice(0, cursor);
        scoreList = scoreList.slice(0, cursor);
        moveList.push(move);
        // User just made a move- add a dummy score for now. We will correct this element once we hear from the engine
        scoreList.push(scoreList.length === 0 ? 0 : scoreList[scoreList.length - 1]);
        cursor = moveList.length;

        if (isMultiplayer()) {
            sendPeerMessage('move', {
                move: {
                    from: move.from,
                    to: move.to,
                    promotion: move.promotion
                }
            });
        }
    };

    // update the board position after the piece snap
    // for castling, en passant, pawn promotion
    var onSnapEnd = function() {
        if (isMultiplayer()) {
            updateStatus();
            return;
        }
        if (!game.game_over() && game.turn() !== player) {
            fireEngine();
        }
    };

    var onMouseoverSquare = function(square) {
        // get list of possible moves for this square
        var moves = game.moves({
            square: square,
            verbose: true
        });

        // exit if there are no moves available for this square
        if (moves.length === 0) return;

        if (board.hasOwnProperty('greySquare') && typeof board.greySquare === 'function') {
            // highlight the square they moused over
            board.greySquare(square);

            // highlight the possible squares for this piece
            for (var i = 0; i < moves.length; i++) {
                board.greySquare(moves[i].to);
            }
        }
    };

    var onMouseoutSquare = function(square, piece) {
        if (board.hasOwnProperty('removeGreySquares') && typeof board.removeGreySquares === 'function') {
            board.removeGreySquares();
        }
    };

    function createBoard(pieceSet) {
        var cfg = {
            cameraControls: true,
            rotateControls: true,
            zoomControls: true,
            freeRotate: true,
            minDistance: 12,
            maxDistance: 26,
            draggable: true,
            position: 'start',
            showNotation: boardInfoVisible,
            onDrop: onDrop,
            onMouseoutSquare: onMouseoutSquare,
            onMouseoverSquare: onMouseoverSquare,
            onSnapEnd: onSnapEnd
        };
        if (board3D) {
            if (pieceSet) {
                if (pieceSet === 'minions') {
                    cfg.whitePieceColor = 0xFFFF00;
                    cfg.blackPieceColor = 0xCC00CC;
                    cfg.lightSquareColor = 0x888888;
                    cfg.darkSquareColor = 0x666666;
                }
                cfg.pieceSet = 'assets/chesspieces/' + pieceSet + '/{piece}.json';
            }
            return new ChessBoard3('board', cfg);
        } else {
            return new ChessBoard('board', cfg);
        }
    }

    adjustBoardWidth();
    board = createBoard();

    $(window).resize(function() {
        adjustBoardWidth();
    });

    // Set up buttons
    $('#startBtn').on('click', function() {
        var cursorStart = 0;
        if (player === 'b') {
            cursorStart = 1;
        }
        while (cursor > cursorStart) {
            game.undo();
            cursor--;
        }
        updateScoreGauge(0);
        board.position(game.fen());
        updateStatus();
    });
    $('#backBtn').on('click', function() {
        if (cursor > 0) {
            cursor--;
            game.undo();
            board.position(game.fen());
            var score = cursor === 0 ? 0 : scoreList[cursor - 1];
            updateScoreGauge(score);
            updateStatus();
        }
    });
    $('#forwardBtn').on('click', function() {
        if (cursor < moveList.length) {
            game.move(moveList[cursor]);
            var score = scoreList[cursor];
            updateScoreGauge(score);
            board.position(game.fen());
            cursor++;
            updateStatus();
        }
    });
    $('#endBtn').on('click', function() {
        while (cursor < moveList.length) {
            game.move(moveList[cursor++]);
        }
        board.position(game.fen());
        updateScoreGauge(scoreList.length == 0 ? 0 : scoreList[cursor - 1]);
        updateStatus();
    });
    $('#hintBtn').on('click', function() {
        if (isMultiplayer() || !engine) {
            return;
        }
        if (game.turn() === player) {
            engineRunning = true;
            var msg = "position fen " + game.fen();
            debugLog("GUI: "+msg);
            engine.postMessage(msg);
            msg = 'go movetime ' + engineMoveTimeMs();
            debugLog(msg);
            engine.postMessage(msg);
            engine.onmessage = function (event) {
                debugLog("ENGINE: "+event.data);
                var best = parseBestMove(event.data);
                if (best !== undefined) {
                    var currentFEN = game.fen();
                    game.move(best);
                    var hintedFEN = game.fen();
                    game.undo();
                    board.position(hintedFEN, true);
                    // give them a second to look before sliding the piece back
                    setTimeout(function() {
                        board.position(currentFEN, true);
                        engineRunning = false;
                    }, 1000); // give them a second to look
                }
            }
        }
    });
    $('#flipBtn').on('click', function() {
        if (game.game_over()) {
            return;
        }
        board.flip(); //wheeee!
        if (player === 'w') {
            player = 'b';
        } else {
            player = 'w';
        }
        updateStatus();
        setTimeout(fireEngine, 1000);
    });

    $('#dimensionBtn').on('click', function() {
        var dimBtn = $("#dimensionBtn");
        dimBtn.prop('disabled', true);
        var position = board.position();
        var orientation = board.orientation();
        board.destroy();
        board3D = !board3D;
        adjustBoardWidth();
        dimBtn.val(board3D? '2D' : '3D');
        setTimeout(function () {
            board = createBoard($('#piecesMenu').val());
            board.orientation(orientation);
            board.position(position, false);
            adjustBoardWidth();
            $("#dimensionBtn").prop('disabled', false);
        });
    });

    quickSettingsToggleBtnEl.on('click', function() {
        showQuickSettingsAnimated();
        updateQuickSettingsLabels();
    });

    quickCloseBtnEl.on('click', function() {
        hideQuickSettingsAnimated();
    });

    quickBoardBtnEl.on('click', function() {
        boardInfoVisible = !boardInfoVisible;
        rebuildBoardPreservingState();
        updateQuickSettingsLabels();
    });

    quickEasyBtnEl.on('click', function() {
        var levels = ['easy', 'medium', 'hard'];
        var current = currentLevel();
        var idx = levels.indexOf(current);
        var next = levels[(idx + 1 + levels.length) % levels.length];
        $('input[name="engineMenu"][data-level="' + next + '"]').prop('checked', true).trigger('change');
        updateQuickSettingsLabels();
    });

    quick3DBtnEl.on('click', function() {
        $('#dimensionBtn').trigger('click');
        setTimeout(updateQuickSettingsLabels, 120);
    });

    $("#setFEN").on('click', function(e) {
        swal({
            title: "SET FEN",
            text: "Enter a FEN position below:",
            type: "input",
            inputType: "text",
            showCancelButton: true,
            closeOnConfirm: false
        }, function(fen) {
            if (fen === false) {
                return; //cancel
            }
            fen = fen.trim();
            debugLog(fen);
            var fenCheck = game.validate_fen(fen);
            debugLog("valid: "+fenCheck.valid);
            if (fenCheck.valid) {
                game = new Chess(fen);
                debugLog("GUI: ucinewgame");
                if (engine) {
                    engine.postMessage('ucinewgame');
                }
                debugLog("GUI: position fen " + fen);
                if (engine) {
                    engine.postMessage('position fen '+ fen);
                }
                board.position(fen);
                fenEl.val(fen);
                pgnEl.empty();
                updateStatus();
                swal("Success", "FEN parsed successfully.", "success");
            } else {
                debugLog(fenCheck.error);
                swal.showInputError("ERROR: "+fenCheck.error);
                return false;
            }
        });
    });

    $("#setPGN").on('click', (function(e) {
        swal({
            title: "SET PGN",
            text: "Enter a game PGN below:",
            type: "input",
            inputType: "text",
            showCancelButton: true,
            closeOnConfirm: false
        }, function(pgn) {
            if (pgn === false) {
                return; // cancel
            }
            pgn = pgn.trim();
            debugLog(pgn);
            var pgnGame = new Chess();
            if (pgnGame.load_pgn(pgn)) {
                game = pgnGame;
                var fen = game.fen();
                debugLog("GUI: ucinewgame");
                if (engine) {
                    engine.postMessage('ucinewgame');
                }
                debugLog("GUI: position fen " + fen);
                if (engine) {
                    engine.postMessage('position fen ' + game.fen());
                }
                board.position(fen, false);
                fenEl.val(game.fen());
                pgnEl.empty();
                moveList = game.history();
                scoreList = [];
                for (var i = 0; i < moveList.length; i++) {
                    scoreList.push(0);
                }
                cursor = moveList.length;
                updateStatus();
                swal("Success", "PGN parsed successfully.", "success");
            } else {
                swal.showInputError("PGN not valid.");
                return false;
            }
        });
    }));

    $("#resetBtn").on('click', function(e) {
        if (isGuest()) {
            swal("Guest mode", "Only host can reset the match.", "info");
            return;
        }
        if (isHost()) {
            resetLocalGamePosition();
            sendPeerMessage('reset', {});
            return;
        }
        player = 'w';
        game = new Chess();
        fenEl.empty();
        pgnEl.empty();
        largestPGN = '';
        moveList = [];
        scoreList = [];
        cursor = 0;
        board.start();
        board.orientation('white');
        debugLog("GUI: ucinewgame");
        if (engine) {
            engine.postMessage('ucinewgame');
        }
        updateScoreGauge(0);
    });

    $('input[name="engineMenu"]').change(function() {
       if (isMultiplayer()) {
            return;
       }
       debugLog($(this).val());
        if (engine) {
            var jsURL = $('input[name="engineMenu"]:checked').val();
            engine.terminate();
            engine = new Worker(jsURL);
            debugLog("GUI: uci");
            engine.postMessage('uci');
            debugLog("GUI: ucinewgame");
            engine.postMessage('ucinewgame');
            updateScoreGauge(0); // they each act a little differently
        }
        updateQuickSettingsLabels();
    });

    $('#piecesMenu').change(function() {
        var fen = board.position();
        board.destroy();
        board = createBoard($('#piecesMenu').val());
        board.position(fen);
        adjustBoardWidth();
    });

    $('#playOfflineBtn').on('click', function() {
        startOfflineMode();
    });

    $('#hostGameBtn').on('click', function() {
        startHostingMode();
    });

    $('#copyHostCodeBtn').on('click', function() {
        if (!hostRoomCode) {
            return;
        }
        copyText(hostRoomCode);
        flashCopiedButton(copyHostCodeBtnEl);
    });

    $('#copyHostLinkBtn').on('click', function() {
        if (!hostInviteLink) {
            return;
        }
        copyText(hostInviteLink);
        flashCopiedButton(copyHostLinkBtnEl);
    });
    
    $('#shareToastCopyBtn').on('click', function() {
        if (!hostInviteLink) {
            return;
        }
        copyText(hostInviteLink);
        flashCopyButton();
    });
    
    $('#shareToastBackBtn').on('click', function() {
        closeNetworking();
        hideShareToast();
        gameMode = 'offline';
        myColor = 'w';
        player = 'w';
        ensureEngineWorker();
        $('#hintBtn').prop('disabled', false).removeClass('hide');
        $('input[name="engineMenu"]').prop('disabled', false);
        updateStatus();
    });

    var joinRoom = new URLSearchParams(window.location.search).get('join');
    if (joinRoom) {
        startGuestMode(joinRoom);
    }
    
    $('.logo').css('cursor', 'pointer').on('click', function() {
        if (gameMode !== 'gate') {
            showModeGate();
        }
    });

    updateStatus();
    updateQuickSettingsLabels();
    hideQuickSettings();
});
