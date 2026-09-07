// ==UserScript==
// @name         LETIteach Question Navigator
// @namespace    https://github.com/eidetism/letiteach-downloader
// @version      0.2.1
// @description  Shows embedded LETIteach video questions one by one without changing course completion data.
// @author       eidetism
// @match        https://open.etu.ru/courses/*/courseware/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    var PANEL_ID = 'letiteach-question-navigator';
    var HIDDEN_CLASS = 'letiteach-navigator-hidden';
    var ACTIVE_CLASS = 'letiteach-navigator-active';
    var initializedRoot = null;
    var questions = [];
    var currentIndex = 0;
    var playbackTimer = null;
    var questionModeActive = false;

    function addStyles() {
        if (document.getElementById(PANEL_ID + '-styles')) {
            return;
        }

        var style = document.createElement('style');
        style.id = PANEL_ID + '-styles';
        style.textContent =
            '.' + HIDDEN_CLASS + '{display:none!important;}' +
            '.' + ACTIVE_CLASS + '{display:block!important;visibility:visible!important;' +
                'opacity:1!important;}' +
            '#' + PANEL_ID + '{position:fixed;top:50%;right:16px;' +
                'transform:translateY(-50%);z-index:2147483647;' +
                'display:flex;flex-direction:column;align-items:stretch;gap:8px;' +
                'max-width:210px;padding:12px;background:#151515;' +
                'color:#fff;border:1px solid #444;border-radius:8px;' +
                'box-shadow:0 6px 24px rgba(0,0,0,.35);' +
                'font:14px/1.4 Arial,sans-serif;}' +
            '#' + PANEL_ID + ' button{padding:6px 10px;border:1px solid #666;' +
                'border-radius:6px;background:#2b2b2b;color:#fff;cursor:pointer;}' +
            '#' + PANEL_ID + ' button:disabled{opacity:.45;cursor:not-allowed;}' +
            '#' + PANEL_ID + ' .letiteach-counter{min-width:110px;text-align:center;}' +
            '#' + PANEL_ID + ' .letiteach-status{color:#b8e986;text-align:center;}' +
            '@media(max-width:1400px){#' + PANEL_ID + '{top:auto;right:12px;' +
                'bottom:12px;left:12px;transform:none;max-width:none;' +
                'flex-direction:row;align-items:center;flex-wrap:wrap;}}';
        document.head.appendChild(style);
    }

    function setHidden(element, hidden) {
        if (!element) {
            return;
        }

        element.classList.toggle(HIDDEN_CLASS, hidden);
    }

    function getQuestionRoot(question) {
        return question.closest('.in-video-problem-wrapper') || question.parentElement;
    }

    function getMediaElements(root) {
        return Array.prototype.slice.call(root.querySelectorAll(
            'video, .video-controls, .video-controls-wrapper, .poster'
        )).filter(function (element) {
            return !questions.some(function (question) {
                return element.contains(question);
            });
        });
    }

    function updatePanel() {
        var panel = document.getElementById(PANEL_ID);
        if (!panel) {
            return;
        }

        var counter = panel.querySelector('.letiteach-counter');
        var previousButton = panel.querySelector('[data-action="previous"]');
        var nextButton = panel.querySelector('[data-action="next"]');

        counter.textContent = 'Вопрос ' + (currentIndex + 1) + ' из ' + questions.length;
        previousButton.disabled = currentIndex === 0;
        nextButton.disabled = currentIndex === questions.length - 1;
    }

    function formatTime(seconds) {
        var safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
        var minutes = Math.floor(safeSeconds / 60);
        var remainder = safeSeconds % 60;

        return minutes + ':' + String(remainder).padStart(2, '0');
    }

    function updatePlaybackStatus(video) {
        var panel = document.getElementById(PANEL_ID);
        var status;
        var watchButton;

        if (!panel) {
            return;
        }

        status = panel.querySelector('.letiteach-status');
        watchButton = panel.querySelector('[data-action="watch"]');

        if (video.ended) {
            window.clearInterval(playbackTimer);
            playbackTimer = null;
            status.textContent = 'Видео дошло до конца';
            watchButton.textContent = 'Просмотр ×8';
            return;
        }

        if (video.paused) {
            window.clearInterval(playbackTimer);
            playbackTimer = null;
            status.textContent = 'Видео на паузе: ' + formatTime(video.currentTime) +
                ' / ' + formatTime(video.duration);
            watchButton.textContent = 'Продолжить ×8';
            return;
        }

        status.textContent = 'Видео ×' + video.playbackRate + ': ' +
            formatTime(video.currentTime) + ' / ' + formatTime(video.duration);
        watchButton.textContent = 'Пауза видео';
    }

    function leaveQuestionModeForPlayback() {
        questionModeActive = false;

        questions.forEach(function (question) {
            var root = getQuestionRoot(question);
            root.classList.remove(HIDDEN_CLASS, ACTIVE_CLASS);
            question.classList.remove(HIDDEN_CLASS, ACTIVE_CLASS);
        });

        if (initializedRoot) {
            getMediaElements(initializedRoot).forEach(function (element) {
                setHidden(element, false);
            });
        }
    }

    function toggleFastPlayback() {
        var video = initializedRoot && initializedRoot.querySelector &&
            initializedRoot.querySelector('video');
        var panel = document.getElementById(PANEL_ID);
        var status = panel && panel.querySelector('.letiteach-status');

        if (!video) {
            if (status) {
                status.textContent = 'Видеоплеер не найден';
            }
            return;
        }

        if (!video.paused && !video.ended) {
            video.pause();
            updatePlaybackStatus(video);
            return;
        }

        if (video.ended) {
            video.currentTime = 0;
        }

        if (questionModeActive) {
            leaveQuestionModeForPlayback();
        }

        video.muted = true;
        video.playbackRate = 8;

        window.setTimeout(function () {
            video.play().then(function () {
                window.clearInterval(playbackTimer);
                playbackTimer = window.setInterval(function () {
                    updatePlaybackStatus(video);
                }, 500);
                updatePlaybackStatus(video);
            }).catch(function (error) {
                if (!status) {
                    return;
                }

                if (error && error.name === 'AbortError') {
                    status.textContent = 'LETIteach остановил видео. Ответьте на открытый вопрос и нажмите ×8 ещё раз.';
                } else {
                    status.textContent = 'Не удалось запустить видео: ' + error.message;
                }
            });
        }, 100);
    }

    function showQuestion(index) {
        var questionRoots;
        var activeQuestion;
        var activeRoot;

        if (!questions.length) {
            return;
        }

        questionModeActive = true;

        var video = initializedRoot && initializedRoot.querySelector &&
            initializedRoot.querySelector('video');
        if (video) {
            video.pause();
        }

        window.clearInterval(playbackTimer);
        playbackTimer = null;

        if (initializedRoot) {
            getMediaElements(initializedRoot).forEach(function (element) {
                setHidden(element, true);
            });
        }

        currentIndex = Math.max(0, Math.min(index, questions.length - 1));

        questionRoots = questions.map(getQuestionRoot);

        questionRoots.forEach(function (root) {
            root.classList.remove(ACTIVE_CLASS);
            root.classList.add(HIDDEN_CLASS);
        });

        questions.forEach(function (question) {
            question.classList.remove(ACTIVE_CLASS);
            question.classList.add(HIDDEN_CLASS);
        });

        activeQuestion = questions[currentIndex];
        activeRoot = getQuestionRoot(activeQuestion);
        activeRoot.classList.remove(HIDDEN_CLASS);
        activeRoot.classList.add(ACTIVE_CLASS);
        activeQuestion.classList.remove(HIDDEN_CLASS);
        activeQuestion.classList.add(ACTIVE_CLASS);

        updatePanel();
        activeRoot.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
        });
    }

    function restoreLecture() {
        var video = initializedRoot && initializedRoot.querySelector &&
            initializedRoot.querySelector('video');
        var panel = document.getElementById(PANEL_ID);

        window.clearInterval(playbackTimer);
        playbackTimer = null;

        if (video) {
            video.playbackRate = 1;
        }

        if (panel) {
            panel.remove();
        }

        questions.forEach(function (question) {
            var root = getQuestionRoot(question);
            root.classList.remove(HIDDEN_CLASS, ACTIVE_CLASS);
            question.classList.remove(HIDDEN_CLASS, ACTIVE_CLASS);
        });

        if (initializedRoot) {
            getMediaElements(initializedRoot).forEach(function (element) {
                setHidden(element, false);
            });
        }

        document.querySelectorAll('.sequence-bottom').forEach(function (element) {
            setHidden(element, false);
        });

        initializedRoot = null;
        questions = [];
        currentIndex = 0;
        questionModeActive = false;
    }

    function createPanel() {
        var panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.innerHTML =
            '<button type="button" data-action="previous">Назад</button>' +
            '<span class="letiteach-counter"></span>' +
            '<button type="button" data-action="next">Следующий вопрос</button>' +
            '<button type="button" data-action="watch">Просмотр ×8</button>' +
            '<button type="button" data-action="restore">Показать лекцию</button>' +
            '<span class="letiteach-status">Ускоренный просмотр не запущен</span>';

        panel.addEventListener('click', function (event) {
            var button = event.target.closest('button[data-action]');
            if (!button) {
                return;
            }

            if (button.dataset.action === 'previous') {
                showQuestion(currentIndex - 1);
            } else if (button.dataset.action === 'next') {
                showQuestion(currentIndex + 1);
            } else if (button.dataset.action === 'watch') {
                toggleFastPlayback();
            } else if (button.dataset.action === 'restore') {
                restoreLecture();
            }
        });

        document.body.appendChild(panel);
    }

    function initializeNavigator() {
        if (document.getElementById(PANEL_ID)) {
            return;
        }

        var foundQuestions = Array.prototype.slice.call(document.querySelectorAll(
            '.in-video-problem-wrapper .xblock-student_view-problem'
        ));

        if (!foundQuestions.length) {
            return;
        }

        questions = foundQuestions;
        currentIndex = 0;
        initializedRoot = questions[0].closest('.video') || document;

        getMediaElements(initializedRoot).forEach(function (element) {
            setHidden(element, true);
        });

        var video = initializedRoot.querySelector && initializedRoot.querySelector('video');
        if (video) {
            video.pause();
        }

        document.querySelectorAll('.sequence-bottom').forEach(function (element) {
            setHidden(element, true);
        });

        createPanel();
        showQuestion(0);
        console.info('[LETIteach Question Navigator] Найдено вопросов: ' + questions.length);
    }

    function handleContinueClick(event) {
        if (!event.target.closest('.in-video-continue') || !questions.length) {
            return;
        }

        window.setTimeout(function () {
            if (currentIndex < questions.length - 1) {
                showQuestion(currentIndex + 1);
            }
        }, 100);
    }

    addStyles();
    document.addEventListener('click', handleContinueClick, true);

    var observer = new MutationObserver(function () {
        window.clearTimeout(observer.timer);
        observer.timer = window.setTimeout(initializeNavigator, 250);
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });

    initializeNavigator();
}());
