// カレンダー（複数日）と日替わりの天気。夜「ねる」と翌日へ進む。
// 天気は はれ／くもり／ゆうだち（通り雨）。初日は はれ で気持ちよく始める。

const WEATHERS = ['sunny', 'sunny', 'sunny', 'cloudy', 'cloudy', 'shower']
const LABELS = { sunny: 'はれ', cloudy: 'くもり', shower: 'ゆうだち' }

export function createCalendar() {
  let day = 1
  let weather = 'sunny'

  function roll() {
    weather = WEATHERS[Math.floor(Math.random() * WEATHERS.length)]
  }

  return {
    get day() {
      return day
    },
    get weather() {
      return weather
    },
    get weatherLabel() {
      return LABELS[weather]
    },
    nextDay() {
      day += 1
      roll()
    },
    setDay(n) {
      day = Math.max(1, n | 0)
    },
  }
}
