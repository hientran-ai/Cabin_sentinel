import { describe,it,expect } from 'vitest'
import { appendDialDigit } from './phoneState'
describe('simulated phone keypad',()=>{
 it('accepts only dial-pad digits without allowing arbitrary text',()=>{
  expect(appendDialDigit('12','3')).toBe('123')
  expect(appendDialDigit('','*')).toBe('*')
  expect(appendDialDigit('','#')).toBe('#')
  expect(appendDialDigit('12','tel:911')).toBe('12')
  expect(appendDialDigit('12','abc')).toBe('12')
 })
 it('caps the display so repeated taps cannot overflow the dialer',()=>{
  expect(appendDialDigit('123456789012345','6')).toBe('123456789012345')
 })
})
