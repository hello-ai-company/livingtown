import { expect, it } from 'vitest'
import { readTrainingDraft, saveTrainingDraft } from './draft'
it('saves only valid condition IDs/enums, never consent/auth/results, and handles unavailable or corrupt storage', () => {
  let text='';const storage={getItem:()=>text,setItem:(_key:string,value:string)=>{text=value}}
  const input={household_id:'h-wheelchair',scenario:'flood',weather:'rain',time_of_day:'day',confirmed:true,token:'not-saved'}
  saveTrainingDraft(storage,input);expect(JSON.parse(text)).toEqual({household_id:'h-wheelchair',scenario:'flood',weather:'rain',time_of_day:'day'})
  expect(readTrainingDraft(storage)?.household_id).toBe('h-wheelchair')
  text=JSON.stringify(input);expect(readTrainingDraft(storage)).toBeUndefined()
  text='{bad';expect(readTrainingDraft(storage)).toBeUndefined()
  expect(readTrainingDraft({getItem:()=>{throw Error()}})).toBeUndefined()
  expect(()=>saveTrainingDraft({setItem:()=>{throw Error()}},input)).toThrow()
})
