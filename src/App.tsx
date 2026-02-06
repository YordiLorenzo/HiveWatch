import { Routes, Route } from 'react-router-dom'
import { useHiveData } from './hooks/useHiveData'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import TeamDetail from './pages/TeamDetail'
import AgentDetail from './pages/AgentDetail'

export default function App() {
  const data = useHiveData()

  return (
    <Layout connected={data.connected}>
      <Routes>
        <Route path="/" element={<Dashboard data={data} />} />
        <Route path="/team/:name" element={<TeamDetail data={data} />} />
        <Route path="/agent/:team/:name" element={<AgentDetail data={data} />} />
      </Routes>
    </Layout>
  )
}
