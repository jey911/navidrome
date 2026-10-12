import React, { useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Layout as RALayout, toggleSidebar } from 'react-admin'
import { useMediaQuery } from '@material-ui/core'
import MobileNavigation from './MobileNavigation'
import { makeStyles } from '@material-ui/core/styles'
import { HotKeys } from 'react-hotkeys'
import Menu from './Menu'
import AppBar from './AppBar'
import Notification from './Notification'
import useCurrentTheme from '../themes/useCurrentTheme'
import { useSearchRefocus } from '../common'

const useStyles = makeStyles({
  // 80px es la altura de la barra de reproducción. En iPhone, con
  // `viewport-fit=cover`, hay que sumar además el inset de la barra de inicio
  // o el final de la lista queda tapado por el reproductor.
  root: {
    paddingBottom: (props) =>
      props.mobile
        ? 'calc(80px + env(safe-area-inset-bottom, 0px))'
        : props.addPadding
          ? 'calc(80px + env(safe-area-inset-bottom))'
          : 0,
  },
})

const NoSidebar = () => null

const Layout = (props) => {
  const mobile = useMediaQuery('(max-width:768px)', { noSsr: true })
  const theme = useCurrentTheme()
  const queue = useSelector((state) => state.player?.queue)
  const classes = useStyles({ addPadding: queue?.length > 0, mobile })
  const dispatch = useDispatch()
  useSearchRefocus()

  const keyHandlers = {
    TOGGLE_MENU: useCallback(() => dispatch(toggleSidebar()), [dispatch]),
  }

  return (
    <HotKeys handlers={keyHandlers}>
      <RALayout
        {...props}
        className={classes.root}
        menu={Menu}
        {...(mobile ? { sidebar: NoSidebar } : {})}
        appBar={AppBar}
        theme={theme}
        notification={Notification}
      />
      {mobile && <MobileNavigation />}
    </HotKeys>
  )
}

export default Layout
