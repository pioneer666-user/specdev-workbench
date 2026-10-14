import { AMBIENCE_BASE, AMBIENCE_PRESETS } from './ambience-presets.js'
import { FOOTSTEP_BASE } from './footstep-surfaces.js'
import { RAIN_BASE } from './rain-presets.js'

// 声音控件只在设置前台可用；开关不与场景的三维输入闸门绑定。
export function createSoundSettings({ root, sound, canInteract, fetchJson }) {
  const doc = root.ownerDocument, get = id => doc.getElementById(id), listeners = []
  let disposed = false, noticesReady = false, noticesLoading = false
  const listen = (node, type, fn) => { node.addEventListener(type, fn); listeners.push([node, type, fn]) }
  const usable = () => !disposed && !get('settingsSoundPanel').hidden && canInteract()
  function sync() {
    if (disposed) return
    const state = sound.get()
    get('soundEnabled').checked = state.enabled; get('soundPreset').value = state.preset
    get('soundMasterVolume').value = String(state.masterVolume); get('soundMasterVolumeValue').textContent = `${state.masterVolume}%`
    get('soundMasterStatus').textContent = state.masterVolume === 0 ? '总音量为 0，全部声音静音；分类设置保持。' : ''
    get('soundDescription').textContent = AMBIENCE_PRESETS[state.preset].description
    get('soundVolume').value = String(state.volume); get('soundVolumeValue').textContent = `${state.volume}%`
    get('soundStatus').textContent = state.message; get('soundRetry').hidden = !state.retry
    get('footstepsEnabled').checked = state.footsteps.enabled
    get('footstepsPreset').value = state.footsteps.preset
    get('footstepsVolume').value = String(state.footsteps.volume); get('footstepsVolumeValue').textContent = `${state.footsteps.volume}%`
    get('footstepsStatus').textContent = state.footsteps.message
    get('rainSoundEnabled').checked=state.rain.enabled
    get('rainSoundVolume').value=String(state.rain.volume);get('rainSoundVolumeValue').textContent=`${state.rain.volume}%`
    get('rainSoundStatus').textContent=state.rain.message
    for (const id of ['soundEnabled', 'soundMasterVolume', 'soundPreset', 'soundVolume', 'footstepsEnabled', 'footstepsPreset', 'footstepsVolume', 'rainSoundEnabled', 'rainSoundVolume', 'soundRetry', 'soundSourcesRetry']) get(id).disabled = !usable()
  }
  listen(get('soundEnabled'), 'change', () => { if (usable()) void sound.setEnabled(get('soundEnabled').checked) })
  listen(get('soundMasterVolume'), 'input', () => { if (usable()) sound.setMasterVolume(Number(get('soundMasterVolume').value)) })
  listen(get('soundPreset'), 'change', () => { if (usable()) void sound.setPreset(get('soundPreset').value) })
  listen(get('soundVolume'), 'input', () => { if (usable()) void sound.setVolume(Number(get('soundVolume').value)) })
  listen(get('soundRetry'), 'click', () => { if (usable()) void sound.retry() })
  listen(get('footstepsEnabled'), 'change', () => { if (usable()) void sound.setFootstepsEnabled(get('footstepsEnabled').checked) })
  listen(get('footstepsPreset'), 'change', () => { if (usable()) sound.setFootstepsPreset(get('footstepsPreset').value) })
  listen(get('footstepsVolume'), 'input', () => { if (usable()) void sound.setFootstepsVolume(Number(get('footstepsVolume').value)) })
  listen(get('rainSoundEnabled'),'change',()=>{if(usable())void sound.setRainEnabled(get('rainSoundEnabled').checked)})
  listen(get('rainSoundVolume'),'input',()=>{if(usable())void sound.setRainVolume(Number(get('rainSoundVolume').value))})
  async function notices() {
    if (!usable() || noticesReady || noticesLoading) return
    noticesLoading = true; get('soundLicenseText').textContent = '正在读取随包许可…'; get('soundSourcesRetry').hidden = true
    try {
      const data = await fetchJson(`${AMBIENCE_BASE}notices.json`)
      const steps = await fetchJson(`${FOOTSTEP_BASE}notices.json`)
      const rain = await fetchJson(`${RAIN_BASE}notices.json`)
      if (disposed) return
      get('soundLicenseText').textContent = data.text + '\n\n' + steps.text + '\n\n' + rain.text; noticesReady = true
    } catch {
      if (!disposed) { get('soundLicenseText').textContent = '许可正文未能加载，请重新加载。'; get('soundSourcesRetry').hidden = false }
    } finally { noticesLoading = false }
  }
  listen(get('soundSources'), 'toggle', () => { if (get('soundSources').open) void notices() })
  listen(get('soundSourcesRetry'), 'click', () => { void notices() })
  sync()
  return { sync, dispose() { disposed = true; for (const [node, type, fn] of listeners) node.removeEventListener(type, fn) } }
}
