# LETIteach Physics Downloader

Небольшой набор скриптов для скачивания доступных пользователю видеофрагментов курса физики LETIteach из HLS-плейлистов в обычные MP4-файлы.

Курс разделяет лекции на самостоятельные видеоблоки. Например, `1_2` обозначает один блок, а файлы вида `1_2_720p_069.ts` являются только короткими сегментами этого блока. Скрипты используют готовый `.m3u8`-плейлист и автоматически собирают сегменты в единое видео.

## Ограничения

- Интерактивные вопросы между видео не входят в HLS-плейлисты и не скачиваются.
- Идентификаторы блоков нужно указать явно, например `1_1,1_2,1_3`.
- Некоторые номера могут отсутствовать или иметь не все варианты качества.
- Используйте скрипты только для материалов, к которым у вас есть законный доступ.

## Зависимости

Нужны `yt-dlp` и `ffmpeg`.

### Windows

```powershell
winget install yt-dlp.yt-dlp
winget install Gyan.FFmpeg
```

### macOS

```bash
brew install yt-dlp ffmpeg
```

### Arch Linux

```bash
sudo pacman -S yt-dlp ffmpeg
```

### Ubuntu и Debian

```bash
sudo apt update
sudo apt install yt-dlp ffmpeg
```

Версия `yt-dlp` в старых выпусках Ubuntu может быть устаревшей. В таком случае используйте `pipx install yt-dlp`.

## Windows

Скачать несколько блоков в 720p:

```powershell
.\download-letiteach.ps1 -LectureIds 1_1,1_2,1_3 -Quality 720p
```

Если PowerShell запрещает запуск локального скрипта:

```powershell
powershell -ExecutionPolicy Bypass -File .\download-letiteach.ps1 -LectureIds 1_1,1_2,1_3 -Quality 720p
```

## Linux и macOS

Сначала разрешите запуск:

```bash
chmod +x download-letiteach.sh
```

Затем скачайте нужные блоки:

```bash
./download-letiteach.sh --ids 1_1,1_2,1_3 --quality 720p
```

## Список блоков в файле

Создайте `lectures.txt`:

```text
# Лекция 1
1_1
1_2
1_3

# Лекция 2
2_1
2_2
```

Windows:

```powershell
.\download-letiteach.ps1 -ListFile .\lectures.txt -Quality 720p
```

Linux и macOS:

```bash
./download-letiteach.sh --list-file ./lectures.txt --quality 720p
```

Строки, начинающиеся с `#`, и пустые строки игнорируются.

## Качество

Поддерживаются следующие значения:

| Значение | Результат |
| --- | --- |
| `best` | Лучший вариант из `master.m3u8` |
| `1080p` | Оригинальный поток `orig` |
| `720p` | Поток 1280x720, значение по умолчанию |
| `540p` | Поток 960x540 |

Пример выбора лучшего качества:

```bash
./download-letiteach.sh --ids 1_2 --quality best
```

## Как найти идентификатор блока

1. Откройте видеоблок в LETIteach.
2. Откройте инструменты разработчика браузера и вкладку `Сеть`.
3. Введите в фильтр `m3u8`.
4. Обновите страницу и запустите видео.
5. Найдите запрос вида:

```text
https://s3stor.etu.ru:8080/letiteach/PHYSICS_LECTURES_HLS/1_2/master.m3u8
```

В этом примере идентификатор блока равен `1_2`.

## Выходные файлы

По умолчанию видео сохраняются в каталог `letiteach-physics`:

```text
letiteach-physics/
├── 1_1.mp4
├── 1_2.mp4
└── 1_3.mp4
```

Другой каталог можно указать параметром `--output` или `-OutputDirectory`.

## Преобразование MP4 в MP3

Конвертеры обрабатывают все MP4-файлы из каталога `letiteach-physics` и сохраняют аудио в `letiteach-audio`. По умолчанию используется mono MP3 с битрейтом 96 кбит/с. Для лекций этого достаточно, а файлы получаются существенно меньше исходного видео.

Windows:

```powershell
.\convert-to-mp3.ps1
```

Linux и macOS:

```bash
chmod +x convert-to-mp3.sh
./convert-to-mp3.sh
```

Выбор другого битрейта и каталогов:

```powershell
.\convert-to-mp3.ps1 -InputDirectory .\videos -OutputDirectory .\audio -Bitrate 128k
```

```bash
./convert-to-mp3.sh --input ./videos --output ./audio --bitrate 128k
```

Уже существующие MP3-файлы пропускаются и не перезаписываются.
