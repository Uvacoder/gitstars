// The Vue build version to load with the `import` command
// (runtime-only or standalone) has been set in webpack.base.conf with an alias.
import 'babel-polyfill'
import Vue from 'vue'
import store from '@/store'
import '@/element-ui'
import App from '@/App'
import i18n from '@/i18n'
import { parseURLSearch } from '@/util'
import { getGitstarsAccessToken, getUserInfo } from '@/api'
import appConfig from '@/config'

Vue.config.productionTip = false

if (process.env.NODE_ENV !== 'production') {
  require('normalize.css')
  require('font-awesome/css/font-awesome.css')
  require('github-markdown-css')
}

const { clientId, clientSecret, localStorageKeys } = appConfig

async function accessTokenProcess() {
  const accessToken = window.localStorage.getItem(localStorageKeys.accessToken)

  if (accessToken) return accessToken

  const storageCode = window.localStorage.getItem(localStorageKeys.code)
  const { code } = parseURLSearch()
  const gitstarsCode = storageCode || code

  if (gitstarsCode) {
    window.localStorage.setItem(localStorageKeys.code, gitstarsCode)

    if (code) {
      let href = window.location.href.replace(/code=[^&]+/, '')
      if (href[href.length - 1] === '?') href = href.slice(0, -1)
      window.history.replaceState({}, null, href)
    }

    // const { access_token: accessToken } = await getGitstarsAccessToken({
    const response = await getGitstarsAccessToken({
      code: gitstarsCode,
      client_id: clientId,
      client_secret: clientSecret,
    })
    const result = {}
    response.split('&').forEach(item => {
      const [key, value] = item.split('=')
      result[key] = value
    })
    const { access_token: accessToken } = result
    window.localStorage.setItem(localStorageKeys.accessToken, accessToken)

    return accessToken
  } else {
    window.location.href = `https://github.com/login/oauth/authorize?client_id=${clientId}&scope=gist`
  }
}

accessTokenProcess()
  .then(async accessToken => {
    const gitstarsUser = window.localStorage.getItem(localStorageKeys.user)

    /**
     * ?????? axios ????????????????????????????????????api.js???
     * ??????????????????????????? window._gitstars.accessToken
     * ???????????????????????????????????????????????????`window._gitstars = { accessToken, user: gitstarsUser ? JSON.parse(gitstarsUser) : await getUserInfo() }`
     * getUserInfo ?????????????????????????????? window._gitstars.accessToken ??????
     */
    window._gitstars = { accessToken }
    window._gitstars.user = gitstarsUser
      ? JSON.parse(gitstarsUser)
      : await getUserInfo()

    if (!gitstarsUser) {
      window.localStorage.setItem(
        localStorageKeys.user,
        JSON.stringify(window._gitstars.user),
      )
    }
  })
  .then(() => {
    /* eslint-disable no-new */
    new Vue({
      store,
      i18n,
      el: '#app',
      template: '<App/>',
      components: { App },
    })
  })
