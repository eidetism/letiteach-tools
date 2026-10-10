// ==UserScript==
// @name         LETIteach Question Navigator
// @namespace    https://github.com/eidetism/letiteach-tools
// @version      0.4.0
// @description  Shows embedded LETIteach video questions one by one and can mark the current lecture as watched.
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

    function setText(element, value) {
        if (element && element.textContent !== value) {
            element.textContent = value;
        }
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

        if (!questions.length) {
            setText(counter, 'Вопросы не найдены');
            previousButton.disabled = true;
            nextButton.disabled = true;
            return;
        }

        setText(counter, 'Вопрос ' + (currentIndex + 1) + ' из ' + questions.length);
        previousButton.disabled = currentIndex === 0;
        nextButton.disabled = currentIndex === questions.length - 1;
    }

    function formatTime(seconds) {
        var safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
        var minutes = Math.floor(safeSeconds / 60);
        var remainder = safeSeconds % 60;

        return minutes + ':' + String(remainder).padStart(2, '0');
    }

    function getVideoLength(root) {
        var video = root.querySelector('video');
        var timeLabel = root.querySelector('.vidtime');
        var parts;

        if (video && Number.isFinite(video.duration) && video.duration > 0) {
            return video.duration;
        }

        parts = timeLabel && timeLabel.textContent.split(' / ')[1];
        if (!parts) {
            return 0;
        }

        return parts.trim().split(':').reduce(function (total, part) {
            return total * 60 + Number(part);
        }, 0) || 0;
    }

    function getCsrfToken() {
        var cookie = document.cookie.split('; ').find(function (row) {
            return row.indexOf('csrftoken=') === 0;
        });

        return cookie ? cookie.split('=')[1] : '';
    }

    function fillWatchTimes(length) {
        var tracker = window.HXVideoWatch;
        var filledSlots = {};
        var added = 0;
        var time;

        if (!tracker || !Array.isArray(tracker.watch_times)) {
            return -1;
        }

        tracker.video_length = length;
        tracker.watch_times.forEach(function (value) {
            filledSlots[Math.floor(value * 2)] = true;
        });

        for (time = 0; time < length; time += 0.5) {
            if (!filledSlots[time * 2]) {
                tracker.watch_times.push(parseFloat((time + Math.random() / 10).toFixed(6)));
                added++;
            }
        }

        return added;
    }

    function markVideoCompleted(videoRoot) {
        var root = videoRoot.closest('[data-metadata]') ||
            videoRoot.querySelector('[data-metadata]') || videoRoot;
        var state = window.jQuery && window.jQuery(root).data('video-player-state');
        var handler = state && state.completionHandler;
        var video = root.querySelector('video');
        var metadata;

        if (handler && typeof handler.markCompletion === 'function') {
            handler.markCompletion(video ? video.currentTime : 0);
            return Promise.resolve('штатный обработчик');
        }

        try {
            metadata = JSON.parse(root.dataset.metadata || '{}');
        } catch (error) {
            return Promise.reject(new Error('не удалось прочитать data-metadata'));
        }

        if (!metadata.publishCompletionUrl) {
            return Promise.reject(new Error('нет publishCompletionUrl'));
        }

        return fetch(metadata.publishCompletionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrfToken()
            },
            body: JSON.stringify({ completion: 1 }),
            credentials: 'include'
        }).then(function (response) {
            if (!response.ok) {
                throw new Error('сервер ответил ' + response.status);
            }

            return 'POST completion';
        });
    }

    function markLectureWatched() {
        var panel = document.getElementById(PANEL_ID);
        var status = panel && panel.querySelector('.letiteach-status');
        var root = initializedRoot;
        var length;
        var added;
        var trackerText;

        if (!root) {
            setText(status, 'Видеоблок не найден');
            return;
        }

        length = getVideoLength(root);
        added = length ? fillWatchTimes(length) : -1;
        trackerText = added < 0 ? 'трекер % не найден' : 'трекер %: +' + added + ' точек';
        setText(status, 'Отправка отметки...');

        markVideoCompleted(root).then(function (method) {
            setText(status, 'Отмечено (' + method + '), ' + trackerText +
                (questions.length ? '' : '. Вопросов нет'));
        }).catch(function (error) {
            setText(status, 'Отметка не отправлена: ' + error.message + ', ' + trackerText);
        });

        if (questions.length) {
            showQuestion(0);
        }
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

    function showLecture() {
        var video = initializedRoot && initializedRoot.querySelector &&
            initializedRoot.querySelector('video');
        var panel = document.getElementById(PANEL_ID);
        var status = panel && panel.querySelector('.letiteach-status');

        leaveQuestionModeForPlayback();

        document.querySelectorAll('.sequence-bottom').forEach(function (element) {
            setHidden(element, false);
        });

        if (video && !video.paused) {
            updatePlaybackStatus(video);
        } else if (status) {
            status.textContent = 'Лекция показана. Можно включить ×8';
        }
    }

    function createPanel() {
        var panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.innerHTML =
            '<button type="button" data-action="previous">Назад</button>' +
            '<span class="letiteach-counter"></span>' +
            '<button type="button" data-action="next">Следующий вопрос</button>' +
            '<button type="button" data-action="watch">Просмотр ×8</button>' +
            '<button type="button" data-action="complete">Отметить просмотренной</button>' +
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
            } else if (button.dataset.action === 'complete') {
                markLectureWatched();
            } else if (button.dataset.action === 'restore') {
                showLecture();
            }
        });

        document.body.appendChild(panel);
    }

    function initializeNavigator() {
        var panel = document.getElementById(PANEL_ID);
        var status;
        var foundQuestions;
        var foundRoot;
        var sameQuestions;

        if (!panel) {
            createPanel();
            panel = document.getElementById(PANEL_ID);
        }

        status = panel.querySelector('.letiteach-status');
        foundQuestions = Array.prototype.slice.call(document.querySelectorAll(
            '.in-video-problem-wrapper .xblock-student_view-problem'
        ));
        foundRoot = (foundQuestions[0] && foundQuestions[0].closest('.video')) ||
            document.querySelector('.video');

        if (!foundRoot) {
            window.clearInterval(playbackTimer);
            playbackTimer = null;
            initializedRoot = null;
            questions = [];
            currentIndex = 0;
            questionModeActive = false;
            updatePanel();
            setText(status, 'Ожидание видеоблока');
            return;
        }

        sameQuestions = initializedRoot === foundRoot &&
            questions.length === foundQuestions.length &&
            questions.every(function (question, index) {
                return question === foundQuestions[index];
            });

        if (sameQuestions) {
            return;
        }

        window.clearInterval(playbackTimer);
        playbackTimer = null;

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

        questions = foundQuestions;
        currentIndex = 0;
        initializedRoot = foundRoot;

        if (questions.length) {
            document.querySelectorAll('.sequence-bottom').forEach(function (element) {
                setHidden(element, true);
            });

            showQuestion(0);
        } else {
            questionModeActive = false;
            updatePanel();
            setText(status, 'Вопросы не найдены. Можно включить ×8');
        }

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
