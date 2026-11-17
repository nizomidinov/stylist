# Настройка Supabase, ИИ и уведомлений

Все команды — из корня проекта. Нужен Node.js LTS.

## 1. База, хранилище фото, RLS

```bash
npx supabase login
npx supabase link --project-ref tfnkwybhpvriglpkbyug
npx supabase db push
```

Миграция `supabase/migrations/20261112000000_core.sql` создаёт таблицы (или дополняет существующие),
включает RLS — данные одной пользовательницы недоступны другой — и закрытый бакет `wardrobe` для фото.
Можно также вставить файл целиком в Dashboard → SQL Editor.

Проверка изоляции: зарегистрируйте два аккаунта, во втором выполните в консоли браузера запрос к
`wardrobe_items` — вернётся пустой список, а не вещи первого.

## 2. ИИ

**По умолчанию ничего настраивать не нужно** — работает собственный ИИ MUSE:
- распознавание вещей — нейросеть CLIP прямо в браузере (фото не покидает телефон, ~90 МБ скачивается один раз);
- подбор образов — встроенный стилист по правилам ТЗ, который учится на «беру / другой / было удобно».

Модель по умолчанию скачивается с Hugging Face. Чтобы не зависеть от зарубежного сервиса, скопируйте папку
модели `Xenova/clip-vit-base-patch16` (файлы `config.json`, `preprocessor_config.json`, `tokenizer*.json`,
`onnx/text_model_quantized.onnx`, `onnx/vision_model_quantized.onnx`) в своё хранилище, сохранив путь
`<хост>/Xenova/clip-vit-base-patch16/resolve/main/...`, и укажите `VITE_MODEL_HOST=https://ваш-хост/`.

Внешний ИИ (OpenAI или совместимый) — необязательное дополнение: в `.env.local` задайте
`VITE_OUTFIT_AI=server` (подбор) и/или `VITE_RECOGNITION=server` (распознавание) и разверните функции ниже.

### Edge Functions (только для внешнего ИИ и удаления аккаунта)

Функция `delete-account` нужна всегда (кнопка «Удалить все мои данные»):

```bash
npx supabase functions deploy delete-account --use-api
```

```bash
npx supabase secrets set OPENAI_API_KEY=ВАШ_СЕРВЕРНЫЙ_КЛЮЧ
npx supabase secrets set OPENAI_TEXT_MODEL=gpt-4o-mini OPENAI_VISION_MODEL=gpt-4o-mini
npx supabase functions deploy generate-outfits
npx supabase functions deploy analyze-clothing
npx supabase functions deploy analyze-figure
npx supabase functions deploy delete-account
npx supabase functions deploy send-reminders --no-verify-jwt
```

Ключ ИИ — только в секретах Supabase. Никогда не кладите его в `.env.local`, `VITE_*` или код.

Необязательные секреты:

| Секрет | По умолчанию | Зачем |
|---|---|---|
| `AI_DAILY_OUTFITS` | 30 | лимит ИИ-подборов на пользовательницу в день (сверх — подбор по правилам) |
| `AI_DAILY_RECOGNITIONS` | 60 | лимит распознаваний фото в день |
| `AI_DAILY_FIGURE` | 3 | лимит определений фигуры по фото |
| `AI_PRICE_INPUT_PER_M` / `AI_PRICE_OUTPUT_PER_M` | 0.15 / 0.60 | цена модели за 1 млн токенов, USD — для учёта расходов. Сверьте с прайсом провайдера |
| `OPENAI_BASE_URL` | https://api.openai.com/v1 | другой OpenAI-совместимый провайдер |

### Фото и юридическая проверка

Распознавание вещи и фигуры по фото отправляют изображение внешнему ИИ, поэтому по умолчанию выключены.
После проверки юристом (договор с провайдером, место обработки, текст согласия):

```bash
npx supabase secrets set AI_PHOTO_PROCESSING_APPROVED=true
```

До этого карточки создаются с пустыми полями — девушка заполняет их касаниями. Удаление фона
работает всегда: оно идёт в браузере, фото никуда не отправляется.

## 3. Удаление фона

По умолчанию — в браузере (`@imgly/background-removal`). Модель (~40 МБ) скачивается один раз с CDN IMG.LY и кешируется.
**Лицензия AGPL-3.0**: для коммерческого запуска купите лицензию IMG.LY или поднимите свой сервер rembg
(например, в Yandex Cloud) и укажите его во фронтенде:

```bash
docker run -p 7000:7000 danielgatis/rembg s --host 0.0.0.0 --port 7000
# .env.local:
VITE_BG_REMOVAL_URL=https://ваш-сервер/api/remove
```

## 4. Уведомления (Web Push)

```bash
npx web-push generate-vapid-keys
npx supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com
# .env.local (и переменные хостинга):
VITE_VAPID_PUBLIC_KEY=тот же публичный ключ
```

Расписание — в SQL Editor (включите расширения `pg_cron` и `pg_net` в Dashboard → Database → Extensions).
Секретный ключ берите в Dashboard → Settings → API (service_role) и не публикуйте:

```sql
select cron.schedule('muse-reminders', '*/15 * * * *', $$
  select net.http_post(
    url := 'https://tfnkwybhpvriglpkbyug.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object('Authorization', 'Bearer ' || 'SERVICE_ROLE_KEY')
  );
$$);
```

На iPhone push приходят только у PWA, добавленной на главный экран (iOS 16.4+). Запасной канал — Telegram-бот —
пока не сделан. Без push приложение всё равно показывает баннер «погода изменилась» и вопрос «было удобно?».

## 5. Авторизация

Dashboard → Authentication:
- **URL Configuration** — Site URL = адрес деплоя (для ссылок входа и подтверждения почты).
- **Email** — включены пароль и Magic Link.
- **Phone** — только если подключён SMS-провайдер.

## 6. Сводки для Павла

- Dashboard → Table editor → `analytics_summary`: регистрации, прошли порог 10 вещей, вернулись через 7/30 дней,
  доля «беру», % «было удобно», среднее время до первого образа.
- `ai_cost_daily`: расходы на ИИ по дням, на одну пользовательницу, попадания в кеш.

## Оценка стоимости ИИ (задача 1)

Сценарий: 30 вещей + 20 подборов в месяц на gpt-4o-mini (цены 0.15 / 0.60 $ за 1 млн токенов — проверить актуальные).

| Операция | Токены | Стоимость |
|---|---|---|
| Распознавание вещи (фото low detail) | ~600 вход + ~150 выход | ~0,0002 $ × 30 = 0,005 $ |
| Подбор образов | ~2 500 вход + ~600 выход | ~0,0007 $ × 20 = 0,015 $ |
| **Итого** | | **≈ 0,02 $ (~2 ₽) в месяц** |

Повторные подборы и одно и то же фото берутся из кеша. Фактические цифры — во view `ai_cost_daily`.
