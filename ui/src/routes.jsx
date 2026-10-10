import React from 'react'
import { Route } from 'react-router-dom'
import Personal from './personal/Personal'
import RemoteView from './remote/RemoteView'
import HelpView from './help/HelpView'
import FoldersView from './folders/FoldersView'

const routes = [
  <Route exact path="/personal" render={() => <Personal />} key={'personal'} />,
  <Route exact path="/remote" render={() => <RemoteView />} key={'remote'} />,
  <Route exact path="/help" render={() => <HelpView />} key={'help'} />,
  <Route
    exact
    path="/folders"
    render={() => <FoldersView />}
    key={'folders'}
  />,
]

export default routes
