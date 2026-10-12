import React, { useCallback, useLayoutEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Layout as RALayout, toggleSidebar } from 'react-admin'
import { useLocation } from 'react-router-dom'
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
  mobileFrame: {
    '@media (max-width:768px)': {
      marginTop: 'calc(var(--mm-mobile-header-height, 56px) + 8px)',
    },
  },
  mobileContent: { '@media (max-width:768px)': { minWidth: 0 } },
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
  const location = useLocation()
  useLayoutEffect(() => {
    if (!mobile) return undefined
    const header = document.querySelector('.MuiAppBar-root')
    const update = () => {
      const height = header?.getBoundingClientRect().height || 56
      document.documentElement.style.setProperty(
        '--mm-mobile-header-height',
        `${height}px`,
      )
    }
    update()
    const observer =
      typeof ResizeObserver !== 'undefined' && header
        ? new ResizeObserver(update)
        : null
    observer?.observe(header)
    window.addEventListener('resize', update)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', update)
      document.documentElement.style.removeProperty('--mm-mobile-header-height')
    }
  }, [mobile])
  useLayoutEffect(() => {
    if (mobile) window.scrollTo(0, 0)
  }, [mobile, location.pathname, location.search])
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
        className={`${classes.root} ${mobile ? 'mm-mobile-layout' : ''}`}
        classes={{
          appFrame: classes.mobileFrame,
          content: classes.mobileContent,
        }}
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
