import axios from 'axios'
import i18n from '@/i18n'
import appConfig from '@/config'
import { validateTagName, notifyInfo, notifyWarn } from '@/helper'
import { getRepoReadme, getRenderedReadme } from '../api'

let repoReadmeSource = axios.CancelToken.source()
let renderedReadmeSource = axios.CancelToken.source()
const { defaultTags, tagCategorys } = appConfig

export default {
  namespaced: true,
  state: {
    repos: [],
    active: {},
    readme: '',
  },
  getters: {
    untaggedRepos (state) {
      return state.repos.filter(repo => !repo._customTags.length)
    },
    reposOfTag (state, getters, rootState) {
      const { repos } = state
      const { active: tag } = rootState.tag
      const { categoryId, id: tagId, name: tagName } = tag

      if (tagId === defaultTags.all.id) return repos
      if (tagId === defaultTags.untagged.id) return getters.untaggedRepos
      if (categoryId === tagCategorys.language.id) return repos.filter(repo => repo.language === tagName)

      return repos.filter(repo => repo._customTags.find(_tag => _tag.id === tag.id))
    },
  },
  mutations: {
    initRepos (state, repos) {
      state.repos = repos
    },
    switchActive (state, repo) {
      state.active = repo
    },
    changeReadme (state, readme) {
      state.readme = readme
    },
    addRepoTag (state, tag) {
      state.active._customTags.push(tag)
    },
    insertRepoTag (state, { repo, tag, tagIndex }) {
      repo._customTags.splice(tagIndex, 0, tag)
    },
    popRepoTag (state) {
      state.active._customTags.pop()
    },
    deleteRepoTag (state, { repoId, tagIndex }) {
      const repo = state.repos.find(repo => repo.id === repoId)
      repo._customTags.splice(tagIndex, 1)
    },
    deleteReposTag (state, tagId) {
      state.repos.forEach(repo => {
        const { _customTags: tags } = repo
        const index = tags.findIndex(tag => tag.id === tagId)
        if (index >= 0) tags.splice(index, 1)
      })
    },
  },
  actions: {
    async switchActive ({ state, commit }, repo) {
      commit('switchActive', repo)
      commit('changeReadme', '')

      /**
       * ?????????????????? repository ???????????? readme ????????????
       * ?????? Github Api ??????????????????????????????????????????
       *
       * ???????????????????????? repository ???????????? A > B > C
       * ???????????? Repo A ??? readme ???????????? 3s ?????????
       * ??? Repo C ??? readme ???????????? 1s ???????????????????????? B???
       * ???????????? 1s ????????? readme ????????????????????? Repo C readme ???????????????????????????
       * ????????? 2s ?????? Repo A readme ??????????????????????????????
       * ?????? readme ???????????????????????? Repo A readme ??????
       * ?????? Repo C ?????????????????? readme ????????? Repo A readme ??????????????????
       *
       * ????????????????????????????????? repository ?????????????????? repository ??????????????????????????? readme ????????? api
       * axios ?????? Cancellation ?????????????????? api ??????
       */
      repoReadmeSource.cancel()
      renderedReadmeSource.cancel()
      repoReadmeSource = axios.CancelToken.source()
      renderedReadmeSource = axios.CancelToken.source()

      try {
        const { content } = await getRepoReadme(repo.owner.login, repo.name, repoReadmeSource)
        // ????????????????????? base64 ??????
        const readme = await getRenderedReadme(decodeURIComponent(escape(atob(content))), renderedReadmeSource)
        commit('changeReadme', readme)
      } catch ({ response }) {
        if (response) commit('changeReadme', response)
      }
    },
    addRepoTag ({ state, commit, dispatch, rootState }, tagName) {
      if (rootState.isUpdatingData) return notifyInfo({ message: i18n.t('update.uncompleted') })

      const { active: activeRepo } = state
      validateTagName(activeRepo._customTags, tagName)
        .then(name => {
          const tag = rootState.tag.tags.find(tag => tag.name === name)
          const newTag = { id: Date.now(), name, repos: [activeRepo.id] }

          commit('addRepoTag', tag || newTag)
          tag ? commit('tag/addTagRepo', { tagId: tag.id, repoId: activeRepo.id }, { root: true }) : commit('tag/addTag', newTag, { root: true })

          dispatch('updateGitstarsData', {
            title: `${activeRepo.owner.login} / ${activeRepo.name}`,
            message: `${i18n.t('addTag')}: ${name}`,
          }, { root: true })
            .catch(() => {
              commit('popRepoTag')
              tag ? commit('tag/popTagRepo', tag.id, { root: true }) : commit('tag/popTag', null, { root: true })
            })
        })
        .catch(({ message }) => notifyWarn({ message }))
    },
    deleteRepoTag ({ state, commit, dispatch, rootState }, { repoId, tagId }) {
      if (rootState.isUpdatingData) return notifyInfo({ message: i18n.t('update.uncompleted') })

      const repo = state.repos.find(repo => repo.id === repoId)
      const tagIndex = repo._customTags.findIndex(tag => tag.id === tagId)
      const tag = rootState.tag.tags.find(tag => tag.id === tagId)
      const repoIndex = tag.repos.findIndex(id => id === repoId)

      commit('deleteRepoTag', { tagIndex, repoId: repo.id })
      commit('tag/deleteTagRepo', { repoIndex, tagId: tag.id }, { root: true })

      dispatch('updateGitstarsData', {
        title: `${repo.owner.login} / ${repo.name}`,
        message: `${i18n.t('deleteTag')}: ${tag.name}`,
      }, { root: true })
        .catch(() => {
          commit('insertRepoTag', { repo, tag, tagIndex })
          commit('tag/insertTagRepo', { repoIndex, tagId: tag.id, repoId: repo.id }, { root: true })
        })
    },
  },
}
