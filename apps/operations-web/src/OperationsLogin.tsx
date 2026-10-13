import { LoginPage } from '@cabinsentinel/auth'

export function OperationsLogin() {
  return <LoginPage portal="operations" showroomImage={`${import.meta.env.BASE_URL}images/vf9-black-showroom.png`}/>
}
